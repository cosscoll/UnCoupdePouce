"""Private project references, never cached project content or permission grants."""
from typing import Annotated
from fastapi import Depends, Path

LIMIT = 50
ProjectId = Annotated[int, Path(ge=1, le=9223372036854775807)]


def install(m):
    with m.connect() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS project_favorites(
          id INTEGER PRIMARY KEY,
          owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL, UNIQUE(owner_id,project_id));
          CREATE INDEX IF NOT EXISTS idx_project_favorites_owner ON project_favorites(owner_id,id DESC);''')

    @m.app.get('/api/project-favorites')
    def list_favorites(user=Depends(m.require('professional'))):
        with m.authenticated_db(user, write=False) as c:
            visible, _ = m.discover_projects(c, user)
            visible = {row['id']: row for row in visible}
            items = []
            for saved in c.execute('SELECT project_id,created_at FROM project_favorites WHERE owner_id=? ORDER BY id DESC', (user['id'],)):
                project = visible.get(saved['project_id'])
                # An unavailable entry exposes only the owner's previously saved reference.
                items.append({'project_id': saved['project_id'], 'created_at': saved['created_at'],
                              'available': project is not None,
                              'project': project | {'is_favorite': True} if project is not None else None})
            return {'items': items, 'limit': LIMIT}

    @m.app.put('/api/project-favorites/{project_id}')
    def save_favorite(project_id: ProjectId, user=Depends(m.require('professional'))):
        with m.authenticated_db(user, write=True) as c:
            visible, _ = m.discover_projects(c, user)
            if not any(row['id'] == project_id for row in visible):
                m.error(404, 'Projet indisponible pour vos profils actuels')
            existing = c.execute('SELECT 1 FROM project_favorites WHERE owner_id=? AND project_id=?', (user['id'], project_id)).fetchone()
            if not existing:
                if c.execute('SELECT COUNT(*) FROM project_favorites WHERE owner_id=?', (user['id'],)).fetchone()[0] >= LIMIT:
                    m.error(409, 'Maximum 50 favoris. Retirez un favori avant d’en ajouter un.')
                stamp = m.now()
                c.execute('INSERT INTO project_favorites(owner_id,project_id,created_at) VALUES(?,?,?)', (user['id'], project_id, stamp))
                c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)', (user['id'], 'save_project_favorite', 'project', project_id, stamp))
            return {'project_id': project_id, 'is_favorite': True}

    @m.app.delete('/api/project-favorites/{project_id}')
    def remove_favorite(project_id: ProjectId, user=Depends(m.require('professional'))):
        with m.authenticated_db(user, write=True) as c:
            # Removal remains possible after a project loses visibility. Never reads its content.
            removed = c.execute('DELETE FROM project_favorites WHERE owner_id=? AND project_id=?', (user['id'], project_id))
            if removed.rowcount:
                c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)', (user['id'], 'remove_project_favorite', 'project', project_id, m.now()))
            return {'project_id': project_id, 'is_favorite': False}

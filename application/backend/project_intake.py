"""Reversible reception of new applications; existing relationships are preserved."""
from fastapi import Depends
from pydantic import BaseModel, Field, StrictBool, StrictInt


class IntakeChange(BaseModel):
    paused: StrictBool
    version: StrictInt = Field(ge=0)


def install(m):
    @m.app.post('/api/projects/{project_id}/application-intake')
    def change_intake(project_id: int, body: IntakeChange, user=Depends(m.require('requester'))):
        with m.authenticated_db(user, write=True) as c:
            project = c.execute('SELECT requester_id,status,hidden,applications_paused,intake_version FROM projects WHERE id=?', (project_id,)).fetchone()
            if not project:
                m.error(404, 'Projet inconnu')
            if project['requester_id'] != user['id']:
                m.error(403, 'Projet appartenant à un autre demandeur')
            if project['status'] != 'open':
                m.error(409, 'La réception ne peut changer que pour un projet encore ouvert')
            if project['intake_version'] != body.version:
                m.error(409, 'La réception a changé dans une autre fenêtre. Actualisez le projet avant de recommencer.')
            if bool(project['applications_paused']) == body.paused:
                m.error(409, 'La réception des candidatures est déjà dans cet état')
            if project['hidden'] and not body.paused:
                m.error(409, 'Une annonce en modération ne peut pas être rouverte ici')
            c.execute('UPDATE projects SET applications_paused=?,intake_version=intake_version+1 WHERE id=?', (int(body.paused), project_id))
            recipients = c.execute("SELECT DISTINCT professional_id FROM applications WHERE project_id=? AND status IN ('pending','accepted')", (project_id,)).fetchall()
            event = 'project_intake_paused' if body.paused else 'project_intake_resumed'
            for recipient in recipients:
                m.queue_notice(c, recipient['professional_id'], event, project_id)
            c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)', (user['id'], event, 'project', project_id, m.now()))
        return {'paused': body.paused, 'version': body.version + 1}

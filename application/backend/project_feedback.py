"""Private, gated feedback after a closed, non-cancelled UCP test project.

F19 starter: no public ratings, no unverified testimonials on professional profiles.
A closed listing does NOT prove real works occurred; the owner must explicitly
confirm an interaction. A single feedback is immutable and remains private.
"""
from fastapi import Depends
from pydantic import BaseModel, Field, StrictBool, StrictInt, field_validator


class FeedbackInput(BaseModel):
    application_id: StrictInt = Field(ge=1)
    rating: StrictInt = Field(ge=1, le=5)
    comment: str = Field(min_length=20, max_length=800)
    collaboration_confirmed: StrictBool

    @field_validator("comment")
    @classmethod
    def normalise_comment(cls, value: str):
        # Intentionally simple; this is private feedback, never a public review.
        clean = " ".join(value.split())
        if len(clean) < 20:
            raise ValueError("Rédigez au moins 20 caractères pour expliquer votre expérience.")
        return clean


def install(m):
    with m.connect() as c:
        c.executescript("""
            CREATE TABLE IF NOT EXISTS project_feedback(
                application_id BIGINT NOT NULL PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
                project_id BIGINT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
                requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                comment TEXT NOT NULL,
                collaboration_confirmed INTEGER NOT NULL CHECK(collaboration_confirmed=1),
                created_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_project_feedback_owner
                ON project_feedback(requester_id,created_at);
        """)

    def own_project(c, pid, user):
        row = c.execute(
            "SELECT id,requester_id,status,cancelled,hidden FROM projects WHERE id=?",
            (pid,),
        ).fetchone()
        if row is None:
            m.error(404, "Projet introuvable")
        if row["requester_id"] != user["id"]:
            m.error(403, "Projet appartenant à un autre demandeur")
        return row

    def selected(c, pid):
        return c.execute(
            """SELECT a.id,a.professional_id,
                      COALESCE(e.alias,u.name) AS professional_name
               FROM applications a
               JOIN users u ON u.id=a.professional_id
               LEFT JOIN enterprise_artisans e ON e.id=a.linked_profile_id
               WHERE a.project_id=? AND a.status='accepted'
               ORDER BY a.id LIMIT 1""",
            (pid,),
        ).fetchone()

    @m.app.get("/api/projects/{project_id}/feedback")
    def get_feedback(project_id: int, user=Depends(m.require("requester"))):
        with m.authenticated_db(user, write=False) as c:
            project = own_project(c, project_id, user)
            application = selected(c, project_id)
            saved = c.execute(
                """SELECT application_id,rating,comment,created_at
                   FROM project_feedback WHERE project_id=? AND requester_id=?""",
                (project_id, user["id"]),
            ).fetchone()
        eligible = (
            project["status"] == "closed"
            and not project["cancelled"]
            and not project["hidden"]
            and application is not None
            and saved is None
        )
        return {
            "eligible": bool(eligible),
            "project_closed": project["status"] == "closed",
            "cancelled": bool(project["cancelled"]),
            "application_id": application["id"] if application else None,
            "professional_name": application["professional_name"] if application else None,
            "feedback": dict(saved) if saved else None,
            "visibility": "private_test",
        }

    @m.app.post("/api/projects/{project_id}/feedback", status_code=201)
    def submit_feedback(project_id: int, body: FeedbackInput, user=Depends(m.require("requester"))):
        if not body.collaboration_confirmed:
            m.error(422, "Confirmez une interaction réelle avant de donner votre retour.")
        with m.authenticated_db(user, write=True) as c:
            project = own_project(c, project_id, user)
            if project["status"] != "closed" or project["cancelled"] or project["hidden"]:
                m.error(409, "Le retour est possible seulement après la clôture non annulée d'un projet.")
            application = selected(c, project_id)
            if application is None or application["id"] != body.application_id:
                m.error(409, "Aucune candidature sélectionnée ne correspond à ce projet.")
            if c.execute("SELECT 1 FROM project_feedback WHERE project_id=?", (project_id,)).fetchone():
                m.error(409, "Un retour a déjà été enregistré pour ce projet.")
            stamp = m.now()
            c.execute(
                """INSERT INTO project_feedback(application_id,project_id,requester_id,
                           professional_id,rating,comment,collaboration_confirmed,created_at)
                   VALUES(?,?,?,?,?,?,1,?)""",
                (application["id"], project_id, user["id"], application["professional_id"],
                 body.rating, body.comment, stamp),
            )
            c.execute(
                "INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)",
                (user["id"], "submit_private_feedback", "application", application["id"], stamp),
            )
        return {
            "ok": True,
            "visibility": "private_test",
            "feedback": {
                "application_id": application["id"],
                "rating": body.rating,
                "comment": body.comment,
                "created_at": stamp,
            },
        }

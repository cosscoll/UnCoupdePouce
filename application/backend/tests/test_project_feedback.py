"""F19: only the owner of a closed, non-cancelled project with an accepted
professional may leave one *private* feedback in this fictional laboratory."""
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from test_lab_api import env, setup, approve, project


def prepare_selected(v, *, finished=False, cancelled=False):
    approve(v)
    pid = project(v)
    call = v["call"]
    aid = call(v["pro"], v["pcsrf"], "post", f"/api/projects/{pid}/apply").json()["id"]
    assert call(v["requester"], v["rcsrf"], "post", f"/api/applications/{aid}/accept").status_code == 200
    if finished:
        suffix = "cancel" if cancelled else "close"
        assert call(v["requester"], v["rcsrf"], "post", f"/api/projects/{pid}/{suffix}").status_code == 200
    return pid, aid


def body(aid, rating=5):
    return {"application_id":aid,"rating":rating,
            "comment":"La mise en relation fictive était claire et les échanges ont été utiles.",
            "collaboration_confirmed":True}


def test_only_closed_non_cancelled_project_with_real_selection_is_eligible(setup):
    v=setup;owner=v["requester"];call=v["call"]
    pid=project(v)
    route=f"/api/projects/{pid}/feedback"
    data=owner.get(route).json()
    assert data["eligible"] is False and data["application_id"] is None
    assert call(owner,v["rcsrf"],"post",route,json=body(999)).status_code==409
    assert call(owner,v["rcsrf"],"post",f"/api/projects/{pid}/close").status_code==200
    assert owner.get(route).json()["eligible"] is False
    assert call(owner,v["rcsrf"],"post",route,json=body(999)).status_code==409
    # Even after project closure, a random unselected professional cannot be reviewed.
    with v["mod"].connect() as db:
        assert db.execute("SELECT COUNT(*) FROM project_feedback").fetchone()[0]==0


def test_owner_private_feedback_after_close_and_account_export(setup):
    v=setup;pid,aid=prepare_selected(v,finished=True)
    route=f"/api/projects/{pid}/feedback";owner=v["requester"]
    d=owner.get(route).json()
    assert d["eligible"] is True and d["application_id"]==aid
    assert d["visibility"]=="private_test"
    assert v["pro"].get(route).status_code==403
    assert v["other"].get(route).status_code==403
    assert v["intruder"].get(route).status_code==403
    assert v["admin"].get(route).status_code==403
    assert owner.post(route,json=body(aid)).status_code==403 # CSRF required
    created=v["call"](owner,v["rcsrf"],"post",route,json=body(aid))
    assert created.status_code==201,created.text
    assert created.json()["feedback"]["rating"]==5
    read=owner.get(route).json()
    assert read["eligible"] is False and read["feedback"]["application_id"]==aid
    assert read["feedback"]["comment"]==body(aid)["comment"]
    assert v["call"](owner,v["rcsrf"],"post",route,json=body(aid,1)).status_code==409
    exported=owner.get("/api/account/export").json()
    assert len(exported["own_feedback"])==1
    assert exported["own_feedback"][0]["rating"]==5
    assert v["pro"].get("/api/account/export").json()["own_feedback"]==[]
    assert v["other"].get("/api/account/export").json()["own_feedback"]==[]
    assert any(a["action"]=="submit_private_feedback" for a in exported["own_activity"])
    # Neither public discovery nor professional application responses expose this review.
    assert "feedback" not in str(v["pro"].get("/api/my-applications").json())


def test_feedback_requires_explicit_interaction_and_bounded_rating_and_message(setup):
    v=setup;pid,aid=prepare_selected(v,finished=True);route=f"/api/projects/{pid}/feedback";call=v["call"]
    invalid=[
        body(aid) | {"collaboration_confirmed":False},
        body(aid) | {"rating":0},
        body(aid) | {"rating":6},
        body(aid) | {"rating":True},
        body(aid) | {"rating":"5"},
        body(aid) | {"comment":"Très bien"},
        body(aid) | {"comment":"x"*801},
        body(aid+100),
    ]
    for payload in invalid:
        response=call(v["requester"],v["rcsrf"],"post",route,json=payload)
        assert response.status_code in (409,422), (payload,response.status_code,response.text)
    assert v["requester"].get(route).json()["eligible"] is True
    assert v["call"](v["requester"],v["rcsrf"],"post",route,json=body(aid)).status_code==201


def test_cancelled_project_does_not_allow_private_rating(setup):
    v=setup;pid,aid=prepare_selected(v,finished=True,cancelled=True)
    route=f"/api/projects/{pid}/feedback"
    d=v["requester"].get(route).json()
    assert d["eligible"] is False and d["cancelled"] is True
    assert v["call"](v["requester"],v["rcsrf"],"post",route,json=body(aid)).status_code==409


def test_feedback_is_unique_under_concurrent_requests(setup):
    v=setup;pid,aid=prepare_selected(v,finished=True)
    endpoint=f"/api/projects/{pid}/feedback"
    def send(_):
        with TestClient(v["mod"].app) as client:
            client.cookies.update(v["requester"].cookies)
            return client.post(endpoint,headers={"x-ucp-csrf":v["rcsrf"]},json=body(aid)).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses=list(pool.map(send,(1,2)))
    assert sorted(statuses)==[201,409]
    with v["mod"].connect() as c:
        assert c.execute("SELECT COUNT(*) FROM project_feedback").fetchone()[0]==1
        assert c.execute("SELECT COUNT(*) FROM audit WHERE action='submit_private_feedback'").fetchone()[0]==1

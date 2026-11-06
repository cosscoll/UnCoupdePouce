"""F35: uploaded work photos are private JPEGs, never an unverified public gallery."""
import base64
import io

from PIL import Image
from fastapi.testclient import TestClient

from test_lab_api import env, setup, approve, project
from test_professional_showcase import BODY, authenticated


def photo_payload(color="red", *, version=1, exif=True):
    img=Image.new("RGB",(22,18),color)
    buffer=io.BytesIO()
    if exif:
        meta=Image.Exif()
        meta[270]="EXIF_PRIVATE_NOT_FOR_PUBLICATION"
        img.save(buffer,format="JPEG",exif=meta)
    else:
        img.save(buffer,format="PNG")
    return {"data":base64.b64encode(buffer.getvalue()).decode(),"version":version}


def test_photo_is_encoded_without_metadata_and_visible_only_to_authorized_candidate(setup):
    v=setup;authenticated(v);approve(v)
    pro,owner,other=v["pro"],v["requester"],v["other"]
    assert pro.put("/api/v4/showcase",json=BODY).status_code==200
    saved=pro.post("/api/v4/showcase/photos/0",json=photo_payload())
    assert saved.status_code==201,saved.text
    photo_id=saved.json()["photo_id"]
    assert photo_id>0 and saved.json()["version"]==2
    own=pro.get(f"/api/v4/showcase/photos/{photo_id}")
    assert own.status_code==200 and own.headers["content-type"]=="image/jpeg"
    assert own.headers["cache-control"]=="no-store"
    image=Image.open(io.BytesIO(own.content))
    assert image.format=="JPEG"
    assert not image.getexif()
    assert b"EXIF_PRIVATE_NOT_FOR_PUBLICATION" not in own.content

    pid=project(v)
    pre=f"/api/projects/{pid}/applications/999/showcase/photos/{photo_id}"
    assert owner.get(pre).status_code==404
    assert other.get(f"/api/v4/showcase/photos/{photo_id}").status_code==403
    assert v["intruder"].get(f"/api/v4/showcase/photos/{photo_id}").status_code==404
    assert v["admin"].get(f"/api/v4/showcase/photos/{photo_id}").status_code==403
    aid=pro.post(f"/api/projects/{pid}/apply").json()["id"]
    url=f"/api/projects/{pid}/applications/{aid}/showcase/photos/{photo_id}"
    assert owner.get(url).content==own.content
    assert other.get(url).status_code==404
    assert v["intruder"].get(url).status_code==403
    assert pro.get(url).status_code==403
    assert TestClient(v["mod"].app).get(url).status_code==401
    listing=owner.get(f"/api/projects/{pid}/applications/{aid}/showcase").json()
    assert listing["works"][0]["photo_id"]==photo_id
    assert "photo_id" not in str(pro.get("/api/projects").json())
    assert "showcase_photo_saved" in [x["action"] for x in pro.get("/api/account/export").json()["own_activity"]]


def test_invalid_uploads_are_rejected_without_storing_any_photo(setup):
    v=setup;authenticated(v);pro=v["pro"]
    # A photo cannot create a realization or bypass the versioned text editor.
    assert pro.post("/api/v4/showcase/photos/0",json=photo_payload()).status_code==404
    assert pro.put("/api/v4/showcase",json=BODY).status_code==200
    invalid=[
        {"data":"invalid===base64","version":1},
        {"data":base64.b64encode(b"not an image").decode(),"version":1},
        {"data":base64.b64encode(b"x"*4_000_001).decode(),"version":1},
        {"data":photo_payload()["data"],"version":0},
        {"data":photo_payload()["data"],"version":True},
    ]
    for body in invalid:
        response=pro.post("/api/v4/showcase/photos/0",json=body)
        assert response.status_code in (413,422),response.text
    assert pro.post("/api/v4/showcase/photos/6",json=photo_payload()).status_code==404
    assert pro.post("/api/v4/showcase/photos/1",json=photo_payload()).status_code==404
    assert v["requester"].post("/api/v4/showcase/photos/0",json=photo_payload()).status_code==403
    assert pro.post("/api/v4/showcase/photos/0",json=photo_payload(),headers={"x-ucp-csrf":"wrong"}).status_code==403
    assert pro.get("/api/v4/showcase").json()["version"]==1
    with v["mod"].connect() as c:
        assert c.execute("SELECT COUNT(*) FROM showcase_photos").fetchone()[0]==0


def test_versions_block_stale_uploads_replacements_and_delete(setup):
    v=setup;authenticated(v);pro=v["pro"]
    assert pro.put("/api/v4/showcase",json=BODY).status_code==200
    first=pro.post("/api/v4/showcase/photos/0",json=photo_payload())
    assert first.status_code==201
    photo_id=first.json()["photo_id"]
    assert pro.post("/api/v4/showcase/photos/0",json=photo_payload("blue")).status_code==409
    second=pro.post("/api/v4/showcase/photos/0",json=photo_payload("blue",version=2,exif=False))
    assert second.status_code==201 and second.json()["version"]==3
    assert second.json()["photo_id"]==photo_id
    assert pro.request("DELETE","/api/v4/showcase/photos/0",json={"version":2}).status_code==409
    deleted=pro.request("DELETE","/api/v4/showcase/photos/0",json={"version":3})
    assert deleted.status_code==200 and deleted.json()["version"]==4
    assert pro.get(f"/api/v4/showcase/photos/{photo_id}").status_code==404
    assert "photo_id" not in pro.get("/api/v4/showcase").json()["works"][0]
    assert pro.request("DELETE","/api/v4/showcase/photos/0",json={"version":4}).json()["changed"] is False
    with v["mod"].connect() as c:
        assert c.execute("SELECT COUNT(*) FROM showcase_photos").fetchone()[0]==0


def test_one_photo_stays_with_its_work_and_removal_cleans_storage(setup):
    v=setup;authenticated(v);pro=v["pro"]
    second=BODY["works"][0]|{"title":"Cuisine fictive"}
    original=BODY|{"works":[BODY["works"][0],second]}
    assert pro.put("/api/v4/showcase",json=original).status_code==200
    photo=pro.post("/api/v4/showcase/photos/0",json=photo_payload()).json()
    current=pro.get("/api/v4/showcase").json()
    work=current["works"][0]
    assert work["photo_id"]==photo["photo_id"]
    reordered=pro.put("/api/v4/showcase",json=original|{
        "works":[second,work],"version":2
    })
    assert reordered.status_code==200,reordered.text
    assert pro.get("/api/v4/showcase").json()["works"][1]["photo_id"]==photo["photo_id"]
    # An owner may remove the item explicitly and storage must be cleaned transactionally.
    removed=pro.put("/api/v4/showcase",json=original|{"works":[second],"version":3})
    assert removed.status_code==200
    assert pro.get(f"/api/v4/showcase/photos/{photo['photo_id']}").status_code==404
    with v["mod"].connect() as c:
        assert c.execute("SELECT COUNT(*) FROM showcase_photos").fetchone()[0]==0


def test_linked_profile_photos_are_isolated_from_manager_and_hidden_when_deactivated(setup):
    v=setup;authenticated(v);approve(v);pro=v["pro"];owner=v["requester"]
    assert pro.put("/api/v4/showcase",json=BODY).status_code==200
    own_id=pro.post("/api/v4/showcase/photos/0",json=photo_payload()).json()["photo_id"]
    assert pro.post("/api/enterprise",json={"label":"Entreprise de test"}).status_code==201
    linked=pro.post("/api/enterprise/artisans",json={
        "alias":"Équipe peinture","trades":["peinture"],"zones":["Toulouse"]}).json()["id"]
    linked_work=BODY["works"][0]|{"trade":"peinture","title":"Mur peint fictif"}
    base=BODY|{"works":[linked_work]}
    path=f"/api/v4/showcase?linked_profile_id={linked}"
    assert pro.put(path,json=base|{"works":[linked_work|{"photo_id":own_id}]}).status_code==422
    assert pro.put(path,json=base).status_code==200
    uploaded=pro.post(f"/api/v4/showcase/photos/0?linked_profile_id={linked}",
                      json=photo_payload("green"))
    assert uploaded.status_code==201,uploaded.text
    photo_id=uploaded.json()["photo_id"]
    assert photo_id!=own_id
    pid=project(v,"peinture")
    aid=pro.post(f"/api/projects/{pid}/apply-linked/{linked}").json()["id"]
    url=f"/api/projects/{pid}/applications/{aid}/showcase/photos/"
    assert owner.get(url+str(photo_id)).status_code==200
    assert owner.get(url+str(own_id)).status_code==404
    assert owner.get(f"/api/projects/{pid}/applications/{aid}/showcase").json()["works"][0]["photo_id"]==photo_id
    assert pro.post(f"/api/enterprise/artisans/{linked}/set-active",json={"active":False}).status_code==200
    assert owner.get(url+str(photo_id)).status_code==404
    assert pro.get(f"/api/v4/showcase/photos/{photo_id}").status_code==200


def test_photo_access_is_revoked_when_project_hidden_or_trade_removed(setup):
    v=setup;authenticated(v);approve(v);pro=v["pro"];owner=v["requester"]
    assert pro.put("/api/v4/showcase",json=BODY).status_code==200
    photo_id=pro.post("/api/v4/showcase/photos/0",json=photo_payload()).json()["photo_id"]
    pid=project(v);aid=pro.post(f"/api/projects/{pid}/apply").json()["id"]
    url=f"/api/projects/{pid}/applications/{aid}/showcase/photos/{photo_id}"
    assert owner.get(url).status_code==200
    with v["mod"].connect() as c:c.execute("UPDATE projects SET hidden=1 WHERE id=?",(pid,))
    assert owner.get(url).status_code==404
    with v["mod"].connect() as c:
        c.execute("UPDATE projects SET hidden=0 WHERE id=?",(pid,))
        c.execute("UPDATE profiles SET trade='electricite',service_trades='[]' WHERE user_id=?",(v["pid"],))
    assert owner.get(url).status_code==404

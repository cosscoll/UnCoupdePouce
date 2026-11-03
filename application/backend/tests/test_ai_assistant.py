"""AI endpoint validation with a fake provider: no actual API usage or fees."""
import json
import pytest
from fastapi.testclient import TestClient
from test_lab_api import env

def demo_reply(action='none'):
    return {
        'reply':'Je peux vous aider à préciser ce chantier selon vos besoins.',
        'action':action,
        'draft':{'title':'Rénover ma salle de bains','description':'Je veux remplacer la douche et réparer un robinet dans ma salle de bains.',
                 'town':'Toulouse','trades':['plomberie'],'timing':'month'},
        'search':{'q':'rénovation','town':'Toulouse','trade':'plomberie','timing':'',
                  'published_within':7,'budget_from':200,'budget_to':3000,'sort':'newest'}
    }

class MockResponse:
    def __init__(self,value):
        self.value=value
    def raise_for_status(self):return None
    def json(self):
        return {'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(self.value)}]}]}

class MockClient:
    replies=[]
    calls=[]
    def __init__(self,**kw):pass
    async def __aenter__(self):return self
    async def __aexit__(self,*exc):return False
    async def post(self,url,headers,json):
        self.calls.append((url,headers,json))
        return MockResponse(self.replies.pop(0))

def make_user(env,role):
    mod,make,call,*_=env
    client,uid,csrf=make(role,'assistant-'+role)
    return client,csrf

def post(client,csrf,text='Aide-moi à décrire un chantier fictif pour ma salle de bains à Toulouse',history=None):
    return client.post('/api/assistant/chat',headers={'x-ucp-csrf':csrf},
                       json={'message':text,'history':history or []})

def test_off_by_default_and_role_auth_and_csrf(env):
    requester,token=make_user(env,'requester')
    assert requester.get('/api/assistant/status').json()['configured'] is False
    assert post(requester,token).status_code==503
    assert requester.post('/api/assistant/chat',json={'message':'Test du chantier fictif'}).status_code==403
    assert TestClient(env[0].app).get('/api/assistant/status').status_code==401
    assert env[3].get('/api/assistant/status').status_code==403

def test_real_model_request_and_validated_draft(env,monkeypatch):
    import ai_assistant
    monkeypatch.setattr(ai_assistant.httpx,'AsyncClient',MockClient)
    monkeypatch.setenv('UCP_AI_ENABLED','1')
    monkeypatch.setenv('UCP_AI_API_KEY','test-only-not-a-real-key')
    MockClient.replies=[demo_reply('prepare_draft')];MockClient.calls=[]
    c,csrf=make_user(env,'requester')
    r=post(c,csrf);assert r.status_code==200,r.text
    body=r.json()
    assert body['draft']['title']=='Rénover ma salle de bains'
    assert body['draft']['budget_min'] is None
    assert body['draft']['photos']==[]
    assert body['search'] is None
    assert len(MockClient.calls)==1
    url,headers,payload=MockClient.calls[0]
    assert url=='https://api.openai.com/v1/responses'
    assert payload['store'] is False and payload['text']['format']['strict'] is True
    assert headers['Authorization'].startswith('Bearer test-only')
    assert payload['input'][-1]['role']=='user'

def test_professional_search_and_cross_role_action_rejection(env,monkeypatch):
    import ai_assistant
    monkeypatch.setattr(ai_assistant.httpx,'AsyncClient',MockClient)
    monkeypatch.setenv('UCP_AI_ENABLED','1')
    monkeypatch.setenv('UCP_AI_API_KEY','test-only')
    pro,csrf=make_user(env,'professional')
    MockClient.replies=[demo_reply('prepare_search'),demo_reply('prepare_draft')]
    r=post(pro,csrf,'Je cherche des chantiers de plomberie à Toulouse de 200 à 3000 euros')
    assert r.status_code==200,r.text
    assert r.json()['search']['budget_from']==200
    assert r.json()['draft'] is None
    r=post(pro,csrf,'Je voudrais aussi un brouillon de chantier de peinture')
    assert r.status_code==200 and r.json()['draft'] is None

def test_daily_cap_is_shared_in_database_and_contact_is_rejected(env,monkeypatch):
    import ai_assistant
    monkeypatch.setattr(ai_assistant.httpx,'AsyncClient',MockClient)
    monkeypatch.setenv('UCP_AI_ENABLED','1')
    monkeypatch.setenv('UCP_AI_API_KEY','test-only')
    monkeypatch.setenv('UCP_AI_USER_DAILY_LIMIT','1')
    c,csrf=make_user(env,'requester')
    MockClient.replies=[demo_reply()]
    assert post(c,csrf,'Contacte-moi au 06 11 22 33 44 pour le projet').status_code==422
    assert post(c,csrf).status_code==200
    assert post(c,csrf).status_code==429
    with env[0].connect() as db:
        assert db.execute("SELECT COUNT(*) FROM ai_assistant_usage").fetchone()[0]==2

def test_model_cannot_inject_unknown_trade_or_coordinates():
    from ai_assistant import draft_proposal,search_proposal
    d=demo_reply()['draft']
    assert draft_proposal(d|{'trades':['nobody-knows']},{'plomberie'}) is None
    assert draft_proposal(d|{'town':'12 rue de Paris'},{'plomberie'}) is None
    assert draft_proposal(d|{'trades':['inconnu','plomberie']},{'plomberie','inconnu'}) is None
    assert search_proposal(demo_reply()['search']|{'budget_from':6000,'budget_to':3000},{'plomberie'}) is None
    assert search_proposal(demo_reply()['search']|{'trade':'admin'},{'plomberie'}) is None

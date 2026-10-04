from app.main import request_windows
from conftest import register

def test_refresh_rotation_and_logout_revoke_access(client):
    headers,user=register(client)
    old=client.cookies.get('celaine_refresh')
    refreshed=client.post('/api/v1/auth/refresh')
    assert refreshed.status_code==200
    assert client.cookies.get('celaine_refresh')!=old
    replay=client.post('/api/v1/auth/refresh',headers={'Cookie':'celaine_refresh='+old})
    assert replay.status_code==401
    assert client.get('/api/v1/auth/me',headers=headers).json()['id']==user['id']
    assert client.post('/api/v1/auth/logout').status_code==204
    assert client.get('/api/v1/auth/me',headers=headers).status_code==401

def test_bad_login_origin_and_input_are_rejected(client):
    register(client)
    assert client.post('/api/v1/auth/login',json={'email':'owner@example.com','password':'incorrect-password'}).status_code==401
    assert client.post('/api/v1/auth/refresh',headers={'Origin':'https://unexpected.example'}).status_code==403
    assert client.post('/api/v1/auth/register',json={'display_name':'Other','email':'other@example.com','password':'short'}).status_code==422
    assert client.get('/api/v1/auth/me',headers={'Authorization':'Bearer invalid'}).status_code==401

def test_register_rate_limit(client):
    # Invalid requests are counted too: guessing cannot bypass the limiter with malformed input.
    request_windows.clear()
    for _ in range(30):
        assert client.post('/api/v1/auth/register',json={}).status_code==422
    assert client.post('/api/v1/auth/register',json={}).status_code==429

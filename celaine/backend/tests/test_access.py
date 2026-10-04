import io
import wave
from conftest import idea,order,register

def wav_data():
    buffer=io.BytesIO()
    with wave.open(buffer,'wb') as file:
        file.setparams((1,2,8000,0,'NONE','not compressed'))
        file.writeframes(b'\0\0'*8000)
    return buffer.getvalue()

def test_drafts_and_full_lyrics_are_private(client):
    owner,_=register(client)
    buyer,_=register(client,'buyer@example.com')
    draft,_=idea(client,owner,status='draft')
    assert client.get('/api/v1/ideas/'+draft['id']).status_code==404
    assert client.get('/api/v1/ideas/'+draft['id'],headers=buyer).status_code==404
    assert client.get('/api/v1/ideas/'+draft['id'],headers=owner).json()['lyrics'].endswith('SECRET FULL LYRIC')
    public,payload=idea(client,owner)
    card=client.get('/api/v1/ideas/'+public['id']).json()
    assert card['lyrics'] is None
    assert 'SECRET' not in card['lyrics_excerpt']
    assert card['creator']['email'] is None
    assert 'original_path' not in card and 'preview_path' not in card
    assert client.patch('/api/v1/ideas/'+public['id'],headers=buyer,json=payload).status_code==404
    assert client.delete('/api/v1/ideas/'+public['id'],headers=buyer).status_code==404

def test_original_audio_requires_ownership_or_paid_license(client):
    owner,_=register(client)
    buyer,_=register(client,'buyer@example.com')
    song,_=idea(client,owner)
    uploaded=client.post(f'/api/v1/ideas/{song["id"]}/audio?kind=original',headers=owner,
                         files={'file':('../../private.wav',wav_data(),'audio/wav')})
    assert uploaded.status_code==200,uploaded.text
    assert uploaded.json()['has_original']
    assert client.get(f'/api/v1/ideas/{song["id"]}/original').status_code==401
    assert client.get(f'/api/v1/ideas/{song["id"]}/original',headers=buyer).status_code==403
    pending=order(client,buyer,song['id']).json()
    assert client.get(f'/api/v1/orders/{pending["id"]}/download',headers=buyer).status_code==403
    assert client.post(f'/api/v1/orders/{pending["id"]}/demo-pay',headers=buyer).status_code==200
    assert client.get(f'/api/v1/ideas/{song["id"]}/original',headers=buyer).content==wav_data()

def test_audio_validation_and_private_preview(client):
    owner,_=register(client)
    song,_=idea(client,owner,status='draft')
    endpoint=f'/api/v1/ideas/{song["id"]}/audio'
    assert client.post(endpoint,headers=owner,files={'file':('script.mp3',b'<script>bad</script>','audio/mpeg')}).status_code==415
    assert client.post(endpoint,headers=owner,files={'file':('valid.wav',wav_data(),'audio/wav')}).status_code==200
    assert client.get(f'/api/v1/ideas/{song["id"]}/preview').status_code==404
    assert client.get(f'/api/v1/ideas/{song["id"]}/preview',headers=owner).status_code==200

def test_comments_and_notifications_are_scoped(client):
    owner,_=register(client)
    buyer,_=register(client,'buyer@example.com','Friendly Writer')
    song,_=idea(client,owner)
    posted=client.post(f'/api/v1/ideas/{song["id"]}/comments',headers=buyer,json={'body':'This chorus has real potential.'})
    assert posted.status_code==201
    notes=client.get('/api/v1/notifications',headers=owner).json()
    assert len(notes)==1 and notes[0]['kind']=='comment'
    assert client.get('/api/v1/notifications',headers=buyer).json()==[]
    assert client.delete(f'/api/v1/ideas/{song["id"]}/comments/{posted.json()["id"]}',headers=owner).status_code==404
    assert client.delete(f'/api/v1/ideas/{song["id"]}/comments/{posted.json()["id"]}',headers=buyer).status_code==204

def test_interactions_deduplicate_and_analytics_stay_private(client):
    owner,_=register(client)
    buyer,_=register(client,'buyer@example.com')
    song,_=idea(client,owner)
    endpoint=f'/api/v1/ideas/{song["id"]}/events'
    assert client.post(endpoint,headers=owner,json={'kind':'view'}).json()['recorded'] is False
    assert client.post(endpoint,headers=buyer,json={'kind':'view'}).json()['recorded'] is True
    assert client.post(endpoint,headers=buyer,json={'kind':'view'}).json()['recorded'] is False
    assert client.post(endpoint,headers=buyer,json={'kind':'play'}).json()['recorded'] is True
    assert client.put(f'/api/v1/ideas/{song["id"]}/reactions/save',headers=buyer,json={'active':True}).status_code==200
    assert client.put(f'/api/v1/ideas/{song["id"]}/reactions/save',headers=buyer,json={'active':True}).json()['saves']==1
    stats=client.get('/api/v1/analytics?days=7',headers=owner).json()
    assert (stats['views'],stats['plays'],stats['saves'])==(1,1,1)
    assert len(stats['daily'])==7
    assert client.get('/api/v1/analytics',headers=buyer).json()['views']==0
    assert client.get('/api/v1/analytics').status_code==401

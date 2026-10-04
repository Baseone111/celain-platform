"""Explicit development fixture import; never runs implicitly at application startup."""
import shutil
from pathlib import Path
from sqlalchemy import select
from .config import settings
from .database import SessionLocal
from .models import Idea, User
from .security import passwords

def seed():
    if settings.environment == 'production':
        raise RuntimeError('Demo seeding is disabled in production')
    audio_dir = Path(__file__).resolve().parents[2]/'public'/'audio'
    if not audio_dir.exists():
        audio_dir = Path('/app/demo_audio')
    people = [('Jamie Rivers','jamie','Kampala, Uganda','#c9d8ab'),
              ('Amara James','amara','Kampala, Uganda','#d3ac91'),
              ('Noah Ellis','noah','London, UK','#aab9cb'),
              ('Eli Okello','eli','Nairobi, Kenya','#d1bf8e'),
              ('Lena Wells','lena','Cape Town, South Africa','#b7a9c1')]
    titles = ['After the rain','Velvet hours','A little closer','Nothing but the sun',
              'Somewhere, slowly','City in my head','Home is a feeling','The way we were','Blue at midnight']
    genres = ['R&B / Soul','R&B / Soul','Afropop','Acoustic','Indie pop','Hip-hop','Acoustic','Indie pop','Electronic']
    lyrics = [
      'When the clouds let go\nAnd the light comes through\nI find a little piece of me\nIn the things I thought I knew\n\n[Chorus]\nAfter the rain, I start again\nA softer sky, a different name',
      'You leave a light on in the hallway\nI leave a word upon your tongue\nWe make a home of all the silence\nAnd all the songs we haven’t sung\n\n[Chorus]\nThese velvet hours, they move so slow\nSay what you mean before you go',
      'Meet me where the evening falls\nWhere the city stops its turning\nI could listen to you all night\nTo the things we’re still unlearning\n\n[Chorus]\nA little closer, just like that\nLet the world wait, let it pass',
      'I’ve got nothing but the sun\nAnd a road beneath my feet\nThere is nowhere left to run\nJust a little hope to keep\n\n[Chorus]\nLet the morning find me here\nWith my hands held to the sky',
      'Somewhere, slowly, I am going\nPast the streets that know my name\nLike a river, never knowing\nIf the sea will feel the same\n\n[Verse]\nThe things I leave behind me\nWill be the things that help me grow',
      'There’s a city in my head\nAnd the lights don’t ever sleep\nEvery word I never said\nEvery promise I can’t keep\n\n[Hook]\nTurn the noise into a rhythm\nTurn the rhythm into peace',
      'Home is a feeling, not a place\nNot a photograph, not a face\nIt’s the way you say my name\nAnd I don’t have to explain',
      'I still take the longer road\nPast the place we used to go\nThere’s a table by the window\nAnd a life we’ll never know',
      'Blue at midnight, silver at dawn\nWe keep dancing after the song\nIf the moment asks us to stay\nLet tomorrow look the other way']
    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email=='jamie@example.com')):
            print('Demo workspace already exists; nothing changed.')
            return
        users = []
        for name,username,location,color in people:
            user = User(display_name=name,username=username,email=username+'@example.com',location=location,
                        avatar_color=color,bio='An independent songwriter collecting moments and melodies.',
                        password_hash=passwords.hash('CelaineDemo2026!'))
            db.add(user)
            users.append(user)
        db.flush()
        settings.storage_dir.mkdir(parents=True,exist_ok=True)
        for i,title in enumerate(titles):
            preview = f'seed-preview-{i%6}.wav'
            original = f'seed-original-{i%6}.wav'
            source = audio_dir/f'preview-{i%6}.wav'
            if source.exists():
                shutil.copyfile(source,settings.storage_dir/preview)
                shutil.copyfile(source,settings.storage_dir/original)
            song = Idea(creator_id=users[[1,2,3,4,2,3,0,0,4][i]].id,title=title,
                        description='An original songwriting sketch. Listen to the preview and explore a new direction.',
                        lyrics=lyrics[i],genre=genres[i],mood=['Uplifting','Romantic','Romantic','Uplifting','Dreamy','Introspective','Introspective','Melancholic','Energetic'][i],
                        idea_type='Lyrics' if i==7 else 'Song sketch' if i==6 else 'Hook',tags=['original','songwriting'],
                        bpm=[92,74,108,86,80,96,78,None,122][i],musical_key=['D major','F minor','A major','C major','G major','E minor','C major','A minor','B minor'][i],
                        price_cents=[4500,6500,3900,2800,5000,3500,3500,3500,8500][i],cover_color=i%6,
                        status='draft' if i in (6,7) else 'published',license_type='exclusive' if i==4 else 'nonexclusive',
                        preview_path=preview if source.exists() and i!=7 else None,original_path=original if source.exists() else None,
                        duration_seconds=18 if i!=7 else 0)
            db.add(song)
        db.commit()
    print('Created five fictional writers and nine music ideas. Sample credentials are documented in README.md.')

if __name__ == '__main__':
    seed()

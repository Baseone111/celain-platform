"""Generate original synthetic chord sketches. These are fixtures, not finished songs."""
import math, struct, wave
from pathlib import Path
RATE, DURATION = 16000, 18
SCALES = [(146.83,185,220,293.66),(174.61,207.65,261.63,349.23),(220,277.18,329.63,440),(130.81,164.81,196,261.63),(196,246.94,293.66,392),(164.81,196,246.94,329.63)]
root = Path(__file__).resolve().parent.parent / 'public' / 'audio'
root.mkdir(parents=True, exist_ok=True)
for index, frequencies in enumerate(SCALES):
 frames=bytearray()
 for n in range(RATE*DURATION):
  t=n/RATE
  beat=t%(60/[92,74,108,86,80,96][index])
  decay=math.exp(-beat*3.0)
  fade=min(1,t/.2,(DURATION-t)/.8)
  chord=sum((math.sin(2*math.pi*f*t)+.18*math.sin(2*math.pi*f*2*t))/len(frequencies) for f in frequencies)
  melody=math.sin(2*math.pi*frequencies[int(t*2)%4]*2*t)*decay*.12
  value=(chord*.22*decay+melody)*max(0,fade)
  frames.extend(struct.pack('<h',int(max(-1,min(1,value))*32767)))
 with wave.open(str(root/f'preview-{index}.wav'),'wb') as sound:
  sound.setparams((1,2,RATE,0,'NONE','not compressed'));sound.writeframes(frames)
print('Generated 6 original 18-second preview fixtures.')

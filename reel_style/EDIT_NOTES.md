# Edit notes: Instagram reel DfsK1Ffh_6i

These notes describe how this reel is edited, for an AI or editor that can't watch it:
https://www.instagram.com/reel/DfsK1Ffh_6i/

I downloaded the video and went through it with ffmpeg. Scene detection found about 250 cuts, and I looked at frames sampled across the whole video. Times are in seconds.

## Basics

- Vertical 9:16 at 720x1280, 30 fps, 2:14 long (134.3 s).
- It's a rap/hip-hop music video montage. The song plays the whole way through, with no voiceover and no on-screen text.
- The footage is a mix of performance and lifestyle clips: a guy in a suit in a room full of balloons and red cups, a guy in a keffiyeh in a home studio, a blond guy in sunglasses on night streets (neon signs, Korean shop fronts, a crowd behind him), two women in long platinum wigs and Adidas track tops, club scenes under purple and pink light, and a bearded guy in glasses rapping into a handheld mic next to a keyboard.
- The audio is loud and compressed: mean −14.9 dB, peak −3.7 dB.

## The main idea: it switches between very fast cutting and long single shots

| Time | What happens |
|---|---|
| 0–35 | Medium pace, roughly one cut every 0.5–1.5 s. Daytime and indoor shots: balloon room, studio, stairs. Bright teal and cyan looks. |
| ~35.5 | Big blue and white light-leak / lens-flare transition into the night-street section. |
| 35–45 | Night street dancing. Uses the same blue flash again partway through. |
| 45–56 | Fast. Cuts land on almost every beat, some only 0.1–0.3 s apart. Wig girls, a tiled tunnel with a cyan light streak. |
| 56–60 | Short pause in cutting, mostly dark frames. |
| 60–67.5 | Fastest stretch. Cuts every 0.1–0.3 s with black-and-white shots mixed in (two guys in suits in the balloon room, heavy vignette). |
| 67.5–89.7 | **No cuts for about 22 s.** One dark, moody shot: a red/orange-lit face close-up, then the rapper with the mic under purple light. |
| 89.7–100.6 | Fast again. Club shots with purple, pink and blue light and motion blur, mixed with the studio rapper. |
| 100.6–112 | Another long single shot of about 11 s: the rapper with the mic, lit blue. |
| 112–120 | Very fast. Cuts about every 0.1–0.2 s, black-and-white suit shots, heavy flicker. |
| 122.8–134 | Ends on one long shot of the rapper under magenta/purple light until the video stops. |

So the pattern is: build up → fast cutting on the loud parts (hook / drop) → hold one shot through a verse → repeat. The long shots sit on the verses and the fast cuts sit on the hooks.

## Transitions and effects

- **Hard cuts on the beat.** Most transitions are plain cuts, timed to the kick and snare. In the fast sections almost every beat is a cut, sometimes on the half-beat.
- **Light leak / lens flare.** A bright blue and white burst, like a flare or light streak, fills the frame for a few frames to cover a cut. It's used for big section changes such as the start of the night-street part.
- **RGB split / chromatic glitch.** Red, green and blue channels pulled apart sideways for a few frames. Seen on a neon-sign shot and in some of the fast cuts.
- **Motion blur and whip smears.** Shots smear sideways into the next, especially in the club footage.
- **Dips to black.** Short black frames (a few frames up to half a second) between sections. The dark lighting makes it look like the video "blinks".
- **Punch-ins and handheld shake.** A lot of shots are handheld and pushed in. Some feel like a quick digital zoom on the cut.
- **Overlay graphics.** Sparks or shattered-glass / firework line graphics show up briefly in a couple of places, white lines on black, screened over the footage.
- **Flicker.** In the fastest sections the light level pulses, partly from the club lights and partly from the edit.

## Color and look

Each section has its own color look, and the look stays the same for a run of shots:

- **Cool teal/cyan:** the balloon room, the night streets, the tiled tunnel. Lifted cyan in the shadows, white highlights.
- **Magenta, purple and red:** the club and the studio rapper. Very saturated, crushed blacks.
- **Black and white:** the suit shots in the fast sections. High contrast with a strong vignette.
- **Warm/orange:** a few close-ups (the red-lit face around 70–80).

Across the whole video: very dark overall, deep blacks, high contrast, some grain and softness (it looks like phone footage that's been heavily compressed), and vignetting on a lot of shots.

## Pacing rules to copy

1. Cut on the beat. On the loud parts (hooks, drops), cut every beat or every half-beat with very short clips (0.1–0.5 s).
2. On verses, hold one performance shot for 10–20 s with no cuts.
3. Cover big section changes with a flash or light leak, or with a short dip to black.
4. Group shots by color look and switch looks when the section changes.
5. Put the strongest effects (RGB split, flash, whip) on the hardest hits, not everywhere.
6. Start bright and readable (the first 30 s), get darker and faster in the middle, and end on a long dark shot.

## Making it with ffmpeg

`beatcut.py` in this folder does an automatic version of this: it finds the beats, cuts on them, adds punch-ins, RGB split, flashes, whips, black dips, color looks, grain and a vignette. It does **not** do the long verse holds or the overlay graphics yet, and it picks clips at random.

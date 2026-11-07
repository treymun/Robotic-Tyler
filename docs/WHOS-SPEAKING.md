# Who's speaking in voice (v2.44)

In a **Standard** voice call, Tyler can put a name in front of each line he hears, so he answers the person who spoke. This shipped in [v2.44.0](https://github.com/treymun/Robotic-Tyler/releases/tag/v2.44.0). It is optional and **on by default**.

Settings → Voice → Standard voice → **Tell the AI who's speaking in voice**. The same switch is on the phone's Settings page. Turn it off and that call is heard as one mix, the same way it was before v2.44.

## What the AI sees

A name is never guessed.

| Situation | Line the AI sees |
|---|---|
| One named person | `Sam (in voice): who planted?` |
| Not named yet | `Speaker 2 (in voice, name unknown): …` |
| Two people at once | `Sam and Alex talking at once: …` |
| Nothing can tell | `Unknown speaker (in voice): …` |

The panel's *Heard* line shows the same name (`Heard Sam: …`). The Signal trail says where the name came from, never what was said. **Checks → Full check** has a row, *Who is speaking in voice*, that lists Steam field and class names and counts only. It does not list people's names or what anyone said.

`Speaker 1` and `Speaker 2` stay the same for that call and start again in the next one. Per-friend memory only keeps a voice line when the speaker is known by their Steam account and was talking alone.

## Where the name comes from

Best source first:

1. **Steam's own talking data**, the signal that lights a member in Steam's voice list, and only after Tyler has seen it switch on and off for the same person. A flag that never changes is ignored. Steam does not document this signal, so Tyler reads likely fields, methods and classes. He does not write to Steam.
2. **Each other person's own audio track.** With one other person in the call, every line is theirs. With several people, a track is named when Steam's talking data lines up with it during that call, or when Steam exposes an id for the track. Until then the person stays `Speaker N`.
3. **Unknown**, and the line says so.

If Steam's data changes or a level meter fails, that line goes out **unlabelled**, as it did before v2.44, with one Signal trail line. The reply is not held or dropped.

## What this does not cover

- **Gemini Live** still hears the call as one mix. Tyler does not send it speaker names. On the current Live models, a text aside during the session would be spoken or would interrupt the reply.
- **Through VB-CABLE** (Settings → Voice → Where Tyler joins voice) the Windows helper hears one mixed device, so this does not apply there.
- The recording sent for hearing does not change. Nothing about anyone's voice is stored: no voiceprints and no speaker models. What was learned about which track is whose lasts for that call only. Names come from Steam's member data.

## What was tested for v2.44

**Mocked.** Fake Steam objects, a fake voice list, and numbers standing in for each person's level. The checks covered the loudest track, two people at once, one other person in the call, flags that never switch, learning a track and then keeping the name, and the switch turned off. With the switch off, the requests matched the v2.43 path.

**In a browser, with a fake Steam page.** Headless Chromium, real WebRTC audio for two people, and the real listener and panel. With a talking flag, the lines were `Sam (in voice)` and `Alex (in voice)`. Without a flag, they stayed `Speaker 1` and `Speaker 2`.

**Not tested.** A real Steam call, Steam's real voice server, Windows audio, and Gemini Live. Steam does not document the talking signal, so that part stays a careful guess until one real call shows which fields switch.

**What one real call will show.** Join a Standard voice call with two friends, let each talk a few times, then run **Checks → Full check** and copy the report. The *Who is speaking in voice* row lists which Steam fields or classes switched, or that none did. Until that report exists, people are still kept apart by their audio tracks, and someone alone in a call with Tyler is named from that.

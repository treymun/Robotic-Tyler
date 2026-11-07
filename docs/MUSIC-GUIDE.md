# Music DJ — YouTube in the voice call

Music plays through Tyler's synthetic microphone, separate from his own speech.
The panel still says to keep his AI in **Text** mode, or to connect the soundboard
only, so a reply and a song are not fighting for the same moment. The bot account
has to stay in the Steam voice channel.

It is in the current desktop app and in the Chrome extension. Open Tyler's panel
→ **Room → Music DJ**. Tyler controls an ordinary YouTube player and sends that
player's sound into the call. He does not download the song, call a music API,
or bypass any lock on the video.

## First setup

### Desktop app (voice in the Steam chat window)

1. Sign in as the bot, connect the group chat, and join Steam voice. Use **Settings → Voice → Where Tyler joins voice → In this app's Steam chat window**. The older **Through VB-CABLE** route is text-only in that window, and the Music DJ is not offered there.
2. Open **Room → Music DJ** and press **Start Music DJ**. One click opens a YouTube window and shares only that window's sound. It does not share your screen, Steam, or other apps.
3. Keep that window open. If YouTube blocks autoplay, click Play there once and accept any consent screen yourself.
4. A friend types `!play artist song` in the connected chat.

**Reopen YouTube window** and **Share its audio again** are there if the window was closed.

### Chrome extension

1. Load the extension (Setup, or the Chrome zip's `How to install.html`), open Steam web chat, connect the group, and join voice on the bot account.
2. Open **Room → Music DJ** and press **Start Music DJ**. YouTube opens in a background tab and Chrome's share picker appears on that same click.
3. Choose the **YouTube tab** and leave **Also share tab audio** on. Do not pick Steam, your desktop, or another window.
4. A friend types `!play artist song`. If autoplay is blocked, click Play in the YouTube tab once and leave it open.

Chrome may ask you to allow the extension's YouTube access the first time.

## Chat commands

| Command | Action |
|---|---|
| `!play ARTIST SONG` | Search YouTube and queue a request |
| `music play ARTIST SONG` | Alternate request form |
| `tyler play ARTIST SONG` | Alternate request form |
| `music skip` | Two votes for groups; one vote from the confirmed sole voice listener |
| `music pause` / `music resume` | Pause or resume music |
| `music stop` | Vote to stop and clear music; two different accounts required |
| `music clear` | Empty waiting songs; current song and its skip votes stay unchanged |
| `music reset` | Shares the stop vote; two different accounts stop/reset music |
| `music queue` / `music now` | Show queued/current requests |
| `music volume 35` | Set relay volume, 0–200 |
| `music help` | Show command help |

The Music panel also accepts requests and volume changes. **Stop music &
sharing** releases the capture tracks as well as stopping playback. Ending
Chrome sharing pauses music. Emergency stop or losing the bot lease also
disconnects the relay. Normal AI pause/mode changes do not stop music.

If requests fill the queue, type **music clear** to remove waiting songs
without interrupting the current one. **music reset**, after two different
people vote, stops everything and clears votes too, keeping YouTube tab
sharing ready for a fresh request. The local panel Reset music is immediate.
Both also accept **!music clear** / **!music reset**, have matching panel
buttons, and require no sender-ID setup. Reset discards pending music
commands/events already waiting in Tyler's local processing queue. New
requests after it completes are accepted normally. These commands clear
the current queue; they do not block future requests from friends.

## Music spam protection (2.3.21)

Friends can make one song request every **5 seconds** per detected account;
other music commands have a **2-second** per-person cooldown. Room bursts
allow **8 accepted commands per 10 seconds**; stop/reset votes are exempt
from that room cap so requests do not crowd them out. Chat clear has a
**10-second** cooldown. Unknown accounts share one bucket, so changing an
unverified display name does not bypass the guard. Existing limits of three
waiting songs per person and twelve overall still apply.

Blocked spam is shown quietly in the panel. Music chat notices are spaced
at least three seconds apart, with one pending notice maximum and priority
for now-playing cards. There is a twelve-command processing limit and a
fifteen-second controller timeout, instead of an unlimited stuck backlog.
Where Steam supplies message IDs, redraws of an old command do not replay it.

Your panel's **Clear waiting queue** and **Reset music** buttons bypass chat
cooldowns and discard pending chat commands. **Pause chat music commands**
temporarily blocks all chat music controls while the current player and
automatic song transitions continue; panel controls stay available. Click
**Resume chat music commands** to allow requests again. Chat resets do not
erase cooldowns or override the panel lock.

## Two-person stop and sender fix (2.3.22)

**music stop** needs two different detected accounts, just like skip.
**music reset** joins that same stop vote. Repeating either command or
changing a nickname does not add another vote for the same account.
Skip and stop counts are separate: one skip plus one stop does not pass.
Both counts reset on a new track. Local panel controls remain immediate.

## Solo skip (2.3.23)

If **exactly one other person** is in Tyler's active voice channel, that
person can type **music skip** once. Tyler checks the actual voice member
list, including silent/muted members, and matches the voter to the sole
listener's account. A different text-chat member does not get this exception.
Each skip checks again, so friends joining restores the two-vote rule.
Keep the active voice channel visible. If membership is not clear or belongs
to a different group, two skip votes remain required. The Music panel reports
the confirmed count or why it is using two votes. Stop/reset remain two-vote
commands even when solo. This does not require AI voice mode or admin rights.

The sender adapter now follows the owning React component for Steam's
actual `msg.unAccountID` / `context.unAccountIDSender` fields, identified
from the installed Steam interface source. It stays inside the current
message and ignores bot-account and quoted-sender data. This fixes a
missing layer in the earlier DOM-only property probe.

The Music DJ's **Sender check** line still reads **Sender check · v2.3.26**.
When a friend's account is detected it adds their name and **ready for skip/stop votes**.
**Check latest sender** inspects the latest visible message. If it says to reopen
Steam, that chat page is still on an older reader: close the Steam chat tab (and
the YouTube tab or window), then open them again from **Start Music DJ**.
Live recognition in your current Steam layout is not something the automated
tests claim to have verified.

## Group DJ features (2.3.19)

- Requests show the sender's name automatically, with no ID entry. The local
  panel labels its own requests **DJ host**. Unknown senders use **Someone
  in chat**, sharing one anonymous request bucket.
- Each person can have at most **3 waiting songs**. The queue rotates between
  requesters, preserving each person's song order. New people get a turn
  ahead of a repeat turn; shown positions can change when someone joins.
- **music skip** needs exactly **2 different accounts**. Repeating the command
  or changing a nickname does not add a vote for the same detected account.
  Votes reset for every song. v2.3.23 allows one skip vote from the confirmed
  sole voice listener; stop/reset stay at two. The DJ can use **Skip now**
  in the Music panel to skip immediately.
- Skip votes require a numeric Steam account identity read automatically
  from the message's own sender/profile markup or bounded React message
  metadata. Nobody has to enter an ID. The shared v2.3.21 reader recognizes
  Steam's speakerName author header and is also used by other chat features.
  Display names, matching cached names, mentions and vanity links alone do
  not count as vote identity. This prevents a nickname from becoming another
  vote. Sender recognition still depends on Steam's page layout.
- **Sender check** in the Music panel reports **ready for skip votes** or
  **name only / sender not detected**. Have each person send a new message
  and check this line. **Check latest sender** also inspects the latest
  visible message. If recognition fails, reconnect the chat reader. This
  build does not claim that your exact live layout has been verified.
- Now-playing messages use a compact music card in Steam chat: actual player
  title, requester name, next song/requester and waiting count. **music now**
  shows that card; **music queue** lists up to six upcoming turns with names.

Example Steam chat card (plain text and emoji, not extension-only styling):

```text
🎶 ━━━ NOW PLAYING ━━━
▶ Artist — Song
👤 Requested by Alex
⏭ Next: Another song · Sam
🎧 3 waiting · music queue · music skip
```

## Sources and behavior

This controls the ordinary visible YouTube player. In Chrome that is a tab you
share in Chrome's picker. In the desktop app it is the app's YouTube window,
and only that window's sound is shared. It does not extract or download media
URLs, access a private music API, or bypass DRM. It selects the first regular
video result in YouTube's own search; an exact artist, title or version is not
guaranteed. It may select a cover, live version, long video or other result.
Use skip or more specific request text when that happens.

YouTube ads, consent screens, regional restrictions, unavailable content and
autoplay rules still apply. Ads may be audible in the shared tab. Native
search/player layout changes can break automatic selection. A Play click
may be necessary after opening or navigation. This is experimental browser
control, not an official YouTube music-streaming integration. Spotify search
and playback are not included in this build.

There are 12 waiting queue slots; exact duplicate active/waiting song queries
are rejected. Queue state is held in the Steam page and is lost on refresh.
Only the dedicated configured YouTube tab is controlled. Existing history
is marked read when binding so old song commands are not intentionally
replayed. Music commands are kept out of ordinary AI text replies.

Sharing includes a video track so the capture stays alive. Tyler connects only
the audio to the voice mixer. He does not record, save or transmit the video.
The shared audio goes to the Steam voice channel while sharing is on. No extra
physical microphone is opened. After sharing, watch the Steam voice meter and
have a friend confirm they can hear the song.

Automated checks cover parsing, routing, sender validation, fair queue
rotation, distinct-account skip votes, chat cards, stale or repeated player
events, and keeping music commands out of AI replies. A headed Chromium check
(no Steam) measured that Tyler's share request leaves YouTube's sound
untouched and in stereo, where Chrome's default processing does not. The
desktop check used a mock Steam page and a mock YouTube window. A real Steam
call and a real YouTube playback have not been part of those checks.

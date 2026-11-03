# Tyler Trivia: Steam chat edition

500 questions in 10 categories, played right in your Steam group chat. Questions,
scores and the final results are posted as chat messages, and the next question
follows on its own.

## Start a match

Type in the connected chat, or use **Sounds → Arcade → Start trivia in chat** in the panel.

| Type | What you get |
|---|---|
| `play trivia` | A group race of 10 mixed questions |
| `play trivia solo` | A solo match; the first person to answer is the player |
| `play trivia gaming` | Only gaming questions |
| `play trivia hard` | Only hard questions (`easy`, `medium` and `hard` work) |
| `play trivia 5` | A 5-question match (3–20; `quick` = 5, `long` = 15, `marathon` = 20) |
| `play trivia solo gaming hard 5` | Mix any of them, in any order |

**Categories:** 🔬 Science · 🏛️ History · 🌍 Geography · 🎬 Movies & TV · 🎵 Music ·
⚽ Sports · 🎨 Art & Books · 🍕 Food & Drink · 🎮 Gaming · 🐾 Animals & Nature. Each has
50 questions at three levels. Nicknames work too: `movies`, `tv`, `songs`, `books`,
`art`, `games`, `animals`, `geo` and so on.

`trivia categories` lists them in chat; `trivia help` posts the commands.

## Playing

Each question shows its category, a progress bar, its level and its points, then four
colour-keyed choices (🟥 A · 🟦 B · 🟨 C · 🟩 D). Reply with the letter, 1–4, or the
answer itself; `guess B` and `the answer is Saturn` work too. Everyone gets one try per
question and has 45 seconds.

- **Group race:** anyone can answer, and the first right answer scores. A wrong answer
  uses your try; the question stays open for everyone else.
- **Solo:** one player, one try per question. A wrong answer reveals the right one.

After a question is answered, the next one follows **8 seconds later**. Type `next` to
go straight away. If nobody tries a question, Tyler reveals the answer and waits for
`next`, so an empty room doesn't fill with questions.

| Command | What it does |
|---|---|
| `next` | Next question now |
| `hint` | 50/50: leaves the right answer and one wrong one; that question then scores half |
| `skip` | Reveal the answer and move on |
| `scores` | Full leaderboard |
| `join Alex` | Join the board under a name (see below) |
| `stop game` | End the match and post the results |

## Points

| | |
|---|---|
| Easy · Medium · Hard | 100 · 150 · 200 |
| ⚡ Speed | up to +50, the faster the better |
| 🔥 Streak | +20 for each question won back to back, up to +100 |
| 💡 Hint | halves that question |
| 💥 Final question | double points |

A streak counts questions you **won** in a row, so it resets when someone else wins one,
when you answer wrong, or when time runs out.

The last message is **🏁 Final results**: the winner, the full board, and in group
matches the awards ⚡ Fastest answer, 🔥 Best streak and 🎯 Sharpshooter (best accuracy
with at least three tries). Solo matches get a rating instead.

Questions don't repeat within a match, and later matches in the same session pick
questions you haven't seen yet until the category runs out. Scores last for the
connected arcade session, not across a browser restart.

## Recognizing players

Tyler first uses verified author information when Steam provides it. Otherwise it looks
for an author label on the message or its message group. Labels are only used for
scorekeeping; they never authorize account actions, and Tyler never guesses a name from
the voice roster.

If Steam doesn't show who sent an answer in a group match, Tyler says so instead of
crediting anyone. Put your name in front, as in `Alex: B`, or register with `join Alex`
and keep using the same prefix. Labels are self-reported, so two people with the same
name can be merged. Solo matches can run as "Solo player" when no author is available.

## How it looks in chat

Steam shows formatting tags such as `[b]` literally when they're typed, so the cards use
emoji, colour squares and Unicode bold letters for the headers. Every line Tyler posts
starts with an emoji or symbol. Tyler's own messages come back through the chat reader,
and this keeps them from ever counting as an answer or a command; a test replays a whole
match to check.

## Squad `!trivia`

The separate Squad trivia (`!trivia`, then `!answer 1–4`, for Squad XP) now draws a random
question from the same 500, skipping the ones asked recently. It still needs
**Multiplayer trivia** turned on in Squad settings and approved Steam IDs.

## Adding or fixing questions

Questions live in `tools/trivia/questions.txt`, one per line:

```
2 | Which planet is famous for its Great Red Spot? | Jupiter | Mars | Saturn | Neptune
```

The first number is the level (1 easy, 2 medium, 3 hard), then the question, the right
answer and three wrong ones. Run `node tools/build.mjs` to rebuild
`browser-extension/trivia-bank.js`. The build refuses duplicate questions, repeated or
missing answers, square brackets, and categories that don't have exactly 50 questions
with at least 5 at each level.

Text chat is required for answers; spoken answers aren't wired to the game. Turn on chat
commands in Sounds and use Connect & start first; soundboard permissions still apply.

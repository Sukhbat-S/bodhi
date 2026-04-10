# Voice Test — X Threads

## Thread 1: commit 1812c7b (Hive role-aware turn budget)

1/ 6 out of 71 Hive missions died last night with error_max_turns.

all of them were Scouts doing web research.

turns out global maxTurns: 8 is fine for Builders but way too tight for an agent running WebSearch + WebFetch chains.

2/ the fix was stupid obvious in hindsight.

different roles need different turn budgets. a Scout chasing 4 sources needs more breathing room than a Builder doing one focused edit.

one number for all 6 roles was never gonna work.

3/ new budget:

Scout: 20
Builder: 12
Sentinel: 10
Commander: 6
Default: 8

Pool now passes maxTurns down to the SDK backend on every execute call. no more global cap.

4/ lesson: when you start adding agent roles, your runtime params stop being global. they become per-role. probably per-task eventually.

"one size fits all" is a smell the moment you have more than 2 roles in your swarm.

5/ Mossetch caught this one btw. i was reading the logs looking for an SDK bug and he pointed at the role column.

sometimes the flamethrower is the wrong tool. sometimes you just need someone to read the table for you 🐉

---

## Thread 2: commit 08eb088 (Nagomi autonomous deliverables)

1/ 11 files for my first agency client. shipped in one evening.

i wrote zero of them.

the Hive built everything in parallel while i was on a call with the client.

2/ the package:

- agency contract (in Mongolian)
- 8-shot iPhone photo brief for their menu shots
- Google Apps Script reservation backend
- 10 fake reservations for the demo
- 3 backup plans if the live demo dies
- research on the next 5 restaurant clients to pitch

3/ throughput during the burst:

429 missions/hour peak
24 active workers
0 final failures

the DAG scheduler resolved dependencies across 6 roles without me touching anything. i just typed the brief, hit dispatch, and went back to the call.

4/ the thing i didn't expect: delegation feels weird at first.

i kept wanting to check every file. i had to force myself to let the Sentinels review the Builders instead of reading everything myself.

trust the mesh or you become the bottleneck.

5/ restaurant agency is the real test. solo dev + Hive vs. a normal 5-person agency that takes 2 weeks to ship a site.

tomorrow is the pitch. let's see if the stack holds up with a real human across the table.

more soon.

---

## Thread 3: commit e593c17 (Hive verification mesh + witness)

1/ shipped the Hive's immune system tonight.

Sentinels auto-review every Builder output. a Witness daemon patrols for stuck agents. profiles track per-role success rates. and when a repair Builder fixes something, the lesson becomes a memory for the next Commander.

it learns from itself now.

2/ before: Builder ships code → hope it works → i read the diff.

after: Builder ships code → Sentinel reviews it → if broken, a Repair Builder fixes it → the fix becomes a pattern memory → next time a Commander decomposes a similar task it already knows.

the loop closes.

3/ the Witness is the part i'm most proud of.

it's a patrol daemon that walks the active mission list every 30s. checks budgets, detects stuck agents, kills zombies. it's not glamorous code. it's basically a nurse.

but without it, stuck missions pile up and the pool starves.

4/ agent profiles are tracked per role. success rate, avg turn count, common failure modes. Commander reads profiles before decomposing so it picks the right role for each subtask.

it's not AGI. it's just reading the scoreboard before the next game.

5/ Ross Mike pattern btw — don't pre-write the skill. do the task, watch what worked, store that as memory, let the next run learn from it. the Hive just does this automatically now.

recursive self-improvement isn't magic. it's a memory row with a confidence score.

6/ 4 commits. verification + witness + profiles + dashboard DAG view + recursive skill evolution. all in one session.

the Hive has an immune system now.

next up: containment.

---

## Self-critique (50 words)

Thread 2 sounds MOST like the voice — numeric punch hook, "trust the mesh," credits the DAG scheduler, admits the weird feeling of delegation. Thread 3 sounds LEAST — phrases like "the loop closes" and "recursive self-improvement isn't magic" drift toward guru tone. Too polished. Real Sukhbat would be rougher, less epigrammatic.

Trigger a $ARGUMENTS briefing by calling:
curl -s -X POST http://localhost:4000/api/scheduler/trigger \
  -H "Content-Type: application/json" \
  -d '{"type":"$ARGUMENTS"}' | python3 -m json.tool

If no argument provided, default to "morning".
Valid types: morning, evening, weekly.

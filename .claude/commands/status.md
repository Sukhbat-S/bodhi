Check BODHI system status:
1. curl -s http://localhost:4000/api/status | python3 -m json.tool
2. curl -s http://localhost:4000/api/gmail/unread | python3 -m json.tool
3. curl -s http://localhost:4000/api/calendar/today | python3 -m json.tool
Report a brief summary of what's online and what's not.

Log a CRM call, meeting, or email from raw notes. The notes are: $ARGUMENTS

Steps:
1. Parse the notes to identify:
   - Who was spoken with (name, company if mentioned)
   - Activity type (Call / Email / Meeting — default to Call if unclear)
   - Date (default to today if not mentioned)
   - What was discussed (concise 1-3 sentence summary)
   - Any next steps or follow-ups mentioned

2. Call `search_contacts` with the person's name to find their Airtable ID.
   - If multiple matches, pick the most likely one based on context (company name, title).
   - If no match found, say so and ask if you should create a new contact first.

3. Show me what you're about to log:
   - Type, Date, Contact, Note summary
   - Ask: "Log this activity? (yes / edit)"

4. If confirmed, call `log_activity` with contact_id (and opportunity_id if you found a linked opportunity).

5. Confirm: "Logged [type] with [name] on [date]."

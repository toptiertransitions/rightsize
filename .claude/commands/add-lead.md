Create a new client lead from raw notes. The notes are: $ARGUMENTS

Steps:
1. Extract from the notes:
   - Client name (required)
   - Email address (if mentioned)
   - Phone number (if mentioned)
   - How they found TTT / source (e.g. Referral, Website, Event)
   - Any background on their situation (timeline, home size, location)
   - Who referred them (if mentioned — note for context)
   - Estimated project value (if inferable from home size / scope)
   - Suggested next step and date

2. Show me a summary of what you extracted:
   ```
   Name:            ...
   Email:           ...
   Phone:           ...
   Source:          ...
   Notes:           ...
   Estimated Value: ...
   Next Step:       ...  (by DATE)
   ```
   Ask: "Create this lead? (yes / edit)"

3. If confirmed, call `create_client_lead` with the extracted data.

4. Confirm with the new contact ID and opportunity ID.

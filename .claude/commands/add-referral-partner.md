Add a new referral partner (company and/or contact) from raw notes. The notes are: $ARGUMENTS

Steps:
1. Extract from the notes:
   - Company name
   - Company type (e.g. Senior Living, Estate Attorney, Realtor, Financial Advisor, Care Manager)
   - Company city, state, address (if mentioned)
   - Priority (High / Medium / Low — default Medium)
   - Contact person: name, title, email, phone
   - Stage (default Identified; use Met if you already met them)
   - Any notes about interests, how you met, or context

2. Check if the company already exists:
   - Call `get_referral_partners` with search = company name
   - If found: show the existing record and ask if you want to add a new contact to it instead

3. Show me a summary:
   ```
   Company: [name] ([type]) — [city, state]
   Priority: [level]
   Contact:  [name], [title]
             [email] | [phone]
   Stage:    [stage]
   Notes:    [any notes]
   ```
   Ask: "Create this referral partner? (yes / edit)"

4. If confirmed:
   - If company is new: call `create_referral_company`, then `create_referral_contact` with the returned company ID
   - If company already exists: call `create_referral_contact` with the existing company ID

5. Confirm with the new record IDs and suggest: "Use /log-call to record your first interaction."

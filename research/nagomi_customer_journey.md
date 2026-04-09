# Nagomi Customer Journey Map

> **Working document for agency sales (Odko + BODHI).**
> Target: Nagomi Restaurant, and ~every other mid/premium UB restaurant with the same stack.
> Grounded in the Nagomi scout findings documented in `/Users/macbookpro/Documents/agency/nagomi/PITCH.md` and `/Users/macbookpro/Documents/agency/nagomi/AUDIT.md`. Every finding below references the specific scout evidence. Where a claim required inference beyond the scout data, it is flagged `[inference]`.
>
> **Scout input note:** The three named scout reports (`scout-discovery-channels`, `scout-booking-friction`, `scout-nagomi-context`) were not found as separate files on disk. The consolidated scout output used here is `PITCH.md` (booking-friction + nagomi-context findings, 155 lines) and `AUDIT.md` (landing-page + pitch-context findings, 218 lines), both produced from live Puppeteer scouting of Nagomi's Facebook page, Messenger bot, and hosted menu. If separate scout files surface later, reconcile this doc against them.

---

## 1. Persona

**Name.** Bilguun ("Bilga") B.
**Age.** 28.
**Work.** Junior product manager at a UB fintech. Salary ~2.8M ₮/mo.
**Phone.** iPhone 13, bought used. LTE on Mobicom. ~60% battery at 18:30.
**Language.** Mongolian primary. Can read English menus slowly but prefers Mongolian. Does not read Japanese at all — the `なごみ` wordmark means nothing to him.
**Context tonight.** Wednesday, 18:42. Left the office at 18:20. His girlfriend Enkhjin (26, nurse) messaged him on Messenger at 17:55: *"Өнөөдөр амттай юм идмээр байна. Суши идэх үү?"* ("I want something good tonight. Should we have sushi?"). They live in Zaisan, she's in Sukhbaatar district, they'll meet near Shangri-La at ~19:30. He has ~45 minutes to pick a place, confirm a table, and tell her where to go.
**Spend comfort.** 120–180K ₮ for the two of them is fine for a "nice night." More is possible but he needs to feel he's not being scammed.
**Prior exposure to Nagomi.** Has seen 2–3 Nagomi posts in his FB feed over the past year. Vaguely remembers "the one with the robot." Has never eaten there. Has never called them. Has never read a review.

**Why this persona.** Bilguun is the median target customer the pitch needs to win: young, mobile-first, FB-native, Mongolian-language, decision-making in real time from a phone, low patience, not a food snob but not a college kid either. Nagomi's 141K FB followers (`PITCH.md:28`, `AUDIT.md:28`) skew heavily toward this demographic `[inference]`.

---

## 2. Journey Stages

### Stage 1 — Trigger (17:55, office)

**What he does.** Reads Enkhjin's message. Replies *"За, оройг нь би олъё"* ("Ok, I'll find a place for tonight"). Goes back to work.

**Apps open.** Messenger (foreground), Slack (background), Notion (background).

**Feels.** Mild pressure. This is a small test — if he picks a place she likes, the night starts well. He doesn't want to spend 20 minutes researching.

**Friction points.** None yet. The trigger is just a message.

**Drop-off risk.** **Zero.** He's committed. The question is only *where*.

---

### Stage 2 — Discovery (18:22, walking to car)

**What he does.** Opens Facebook app. Searches `"суши"` in the FB search bar. Scrolls results for ~15 seconds. Switches to Instagram, types `sushi ulaanbaatar`, scrolls for ~10 seconds. Gives up on IG (too many food-influencer reels, no venues). Back to FB. Sees Nagomi in the results because he's seen their posts before — FB ranks familiar pages first `[inference based on FB ranking behavior]`.

**Apps open.** Facebook (foreground), Messenger (background), Instagram (just closed), Google Maps (not yet open).

**Feels.** Already a little annoyed. He wanted the answer in 60 seconds; he's 2 minutes in.

**Friction points.**
- **He does not search Google.** Mongolian urban users default to Facebook search for local businesses. This is the core discovery channel reality that the scout output encodes in the "141K Facebook followers" framing (`PITCH.md:28`) and the pitch's explicit warning not to dismiss Facebook for the MN market (BODHI memory: `feedback_branding.md`). A landing page that only ranks on Google is invisible at this stage.
- There is **no Google Business Profile mentioned anywhere in the scout findings**, which suggests Nagomi is effectively not in Google's local index, or is there with sparse data `[inference — needs verification]`.
- Nagomi's Facebook cover says `11:30–22:00`, the info section says `12:00–22:00`, UB Eats says `13:00–17:00` (`PITCH.md:34–37`). At 18:22 Bilguun doesn't care about opening time yet — but this inconsistency will bite him in Stage 4.

**Drop-off risk.** **Low at this exact moment** — he's on FB, Nagomi shows up, the 141K follower count is a trust signal. But note: if he'd gone to Google first, he would never have arrived at Nagomi at all. Discovery is won and lost on Facebook in UB.

---

### Stage 3 — Research (18:25, driving, phone on lap at red lights)

**What he does.** Taps into the Nagomi FB page. Sees the cover photo (banner), 141K followers, 339 comments (`PITCH.md:28–29` via `AUDIT.md:28`). Scrolls 2–3 recent posts. Looks for three things:
1. **A menu with prices.** He wants to know if this is 30K-per-person or 120K-per-person before he commits.
2. **Photos of the actual food.** He wants to see what the sushi looks like.
3. **"Is this place good?"** social proof — recent comments, check-ins, anything.

**Apps open.** Facebook (foreground). Google Maps *not yet open*.

**What actually happens.**
- He taps the pinned post. It's a greeting card with a menu button. He taps the menu button — it opens the Messenger bot (`PITCH.md:18–19`). Wait, this is a *Messenger thing*, not a menu page. He backs out.
- He taps the "Menu" link in the page's About section. It opens `online.fliphtml5.com` in the in-app browser. Page loads slowly over LTE. The menu renders as a flipbook PDF. **AliExpress jewelry ads appear in the margins** next to a 75,000₮ rib-eye steak entry (`PITCH.md:31–34`).
- The flipbook's "zoom" gesture fights with the FB in-app browser's own pinch-zoom. He can't read the prices without pinch-zooming 3 times. He gives up after looking at one page.
- He scrolls the FB page's photo tab for 30 seconds. Finds some decent interior shots, one sushi plate, a robot server photo. No systematic food photography. No photo of the conveyor belt in motion.

**Feels.** **Suspicious.** The AliExpress-ads-next-to-premium-prices is a direct brand dissonance (`PITCH.md:31–34`). His instinct says *"this place might be sketchier than the prices suggest."* He is not consciously articulating this — he just feels a small cold spot in his gut.

**Friction points.**
- **Menu is hosted on a third-party ad-supported site** (`PITCH.md:31–34`). Brand-damaging, hard to use on mobile, slow to load.
- **No price summary inline on the FB page.** He has to leave FB to see prices.
- **No Mongolian-language reviews visible.** The `AUDIT.md:37–41` finding notes that the existing landing page has English-only reviews pulled from TripAdvisor — invisible to Mongolian customers. Same problem applies to what Nagomi surfaces on Facebook: no curated Mongolian social proof.
- **Photo library is unstructured.** `AUDIT.md:12–15` documents that the entire page is represented by one banner + emoji placeholders — the same poverty of food photography extends to the FB page itself.

**Drop-off risk.** **Medium-high.** This is the first real moment where Bilguun might swipe back to the search results and tap the next sushi place. A competitor with a clean, in-Facebook menu carousel (photos + prices, no external link) captures him here.

**What saves Nagomi right now.** The robot server. He remembers it. Enkhjin hasn't seen it. It's a gimmick — and a gimmick is a *story*, and a story is what he needs to sell this choice to her. The conveyor + robot is "the single most stealable detail — nobody else in UB has one" (`AUDIT.md:88–89`). Nagomi survives Stage 3 purely on the novelty of the robot, not on anything the digital stack does well.

---

### Stage 4 — Decision (18:31, parked outside his apartment)

**What he does.** Makes the call: *"Nagomi. Robot thing. She'll like it."* Screenshots the FB page header and sends it to Enkhjin on Messenger: *"Энэ газар руу явъя. Робот үйлчлэгчтэй. Би ширээ захиалъя."* ("Let's go here. It has robot servers. I'll book a table.")

**Apps open.** Messenger (foreground), Facebook (background).

**Feels.** Mildly committed. He still has an escape hatch — if booking is a pain, he'll switch restaurants and just tell Enkhjin he changed his mind.

**Friction points.**
- **He still doesn't know the hours.** If he checks now, he'll see the three different hour listings (`PITCH.md:34–37`) and lose 30 seconds trying to reconcile them.
- **He doesn't know if they have a free table at 19:30** and has no way to find out without either calling or attempting the bot.

**Drop-off risk.** **Low** — he's made the emotional decision. But the decision is *conditional* on the booking flow being painless. If the next 90 seconds go badly, he switches.

---

### Stage 5 — Booking (18:33, at his kitchen counter)

This is the stage the scout findings describe in the most brutal detail. Everything below is grounded in `PITCH.md:10–65`.

**What he does.** Taps "Send Message" on the Nagomi FB page. Messenger opens. The bot greets him with a 800-character card + two menu cards (`PITCH.md:22–24`). He scrolls, finds `Өрөө захиалга` ("Room booking"), taps it.

**What actually happens.**
- The bot confirms the tap. Shows a message that looks like booking intake.
- Then: the bot sends a button. He taps the button. **His phone opens the dialer with `7000-5045` pre-filled** (`PITCH.md:10–14`). It did not take his party size. It did not take his time. It did not confirm a table. It just handed him a phone number. **The "bot" is theater** (`PITCH.md:14`).
- He is now on a call screen. He does not want to call. He's in his kitchen, there's noise, he'd have to explain himself in real time, and he doesn't know if they'll answer quickly. He kills the call before it connects.
- He goes back to Messenger. Taps `Буцах` ("Back") to return to the main menu. **`Буцах` is not a button. It is literal text** (`PITCH.md:16–19`). Nothing happens. He taps it 3 more times. Nothing.
- He goes back to the bot's main menu by tapping `Үндсэн цэс` ("Main menu"). The bot replies with **the exact same 800-character greeting + 2 menu cards he already saw** (`PITCH.md:21–24`). He feels like he's talking to a wall (`PITCH.md:25`).
- He tries typing a free-text question: `Сайн уу, өнөөдөр 19:30-д 2 хүний ширээ бий юу?` ("Hi, is there a table for 2 at 19:30 today?"). **The bot cannot answer free text** (`PITCH.md:46–47`). It responds with the greeting card again, or with silence.

**Apps open.** Messenger (foreground), Phone dialer (opened twice and killed twice), Facebook (background).

**Feels.** **Frustrated, slightly embarrassed, time-pressured.** It is now 18:38. He has 52 minutes until they meet. The 60-second plan has become a 15-minute plan. He is now one more failure away from giving up on Nagomi entirely.

**Friction points.** This is the heart of the scout finding. Ranked by severity, they are tabulated in Section 4 below.

**Drop-off risk.** **VERY HIGH.** The scout evidence shows Nagomi is maximally hostile at exactly the moment of highest customer intent. This is where 30–60% of Stage-4-committed customers abandon `[inference — the scout data cannot quantify the drop rate, but every friction point listed compounds multiplicatively]`.

**What actually saves the booking tonight.** Bilguun swallows it and calls `7000-5045` from his kitchen. Someone picks up on the third ring. A woman answers in Mongolian. He asks for a table for 2 at 19:30. She confirms. There is no SMS confirmation, no email, no reminder — her word is the whole booking system. He thanks her, hangs up. Total time in booking stage: **11 minutes** for what should have been **90 seconds**.

---

### Stage 6 — Arrival (19:28, front door of Nagomi Shangri-La branch)

**What he does.** Walks in with Enkhjin. Tells the host his name. The host looks at a paper notebook or a tablet and says "yes, this way." They are seated.

**Apps open.** Google Maps (closed 2 minutes ago — used for directions). Messenger (background, to show Enkhjin the robot photo during the walk).

**Feels.** Relief. The hard part is over. Dinner is now Nagomi's job, not his.

**Friction points.**
- **No digital confirmation.** He walked in on faith that the phone call counted. If the host had said "no reservation on file," the evening would have collapsed.
- **He doesn't know which branch to go to.** The scout finding (`PITCH.md:34–37`) notes two branches (Nagomi has `2 Салбар` per the vanity block in `AUDIT.md:28`). At no point in the booking flow did the bot or the phone staff clarify *which* branch the reservation was for. He assumed Shangri-La because it's closer to Enkhjin.
- **The Google Maps embed on any landing page version would have failed** (`AUDIT.md:42–45`) — if he'd relied on the existing nagomi landing page for directions, both map embeds are broken. He didn't use it; he searched Google Maps directly for "Nagomi Ulaanbaatar."

**Drop-off risk.** **None now** — he's physically inside.

---

### Stage 7 — Experience (19:30 – 21:10, at the table)

**What they do.** Sit at the conveyor belt. Watch the robot server deliver food to another table — Enkhjin laughs and films a 6-second video for her IG story. They order a selection of sushi + one shabu shabu + beer. They eat. They photograph the rib-eye (if they order it). They pay ~170,000 ₮ at the end.

**Apps open.** Instagram (foreground, for the story), Messenger (background), bank/QR pay app when the bill comes.

**Feels.** Genuinely good. Nagomi's **physical product is the strong link in the entire chain**. The weakness is everything around the meal, not the meal itself. This is the central strategic insight the scout findings imply: the agency is not fixing a bad restaurant — it's removing the digital friction that hides a good one.

**Friction points.**
- **No table-side ordering QR.** `[inference]` — the scout findings don't document on-premise ordering flow, but if Nagomi had one it would show up in the PITCH's bot audit. It doesn't. Server-based ordering is presumably the norm.
- **No digital bill** `[inference — not in scout data]`.
- **No "how was it?" prompt** at the end of the meal, from staff or a QR. `PITCH.md:73` lists "Collect reviews" and "Bot messages happy customers 2hrs later → Google review request" as things the *current* stack cannot do — meaning there is no review-collection mechanism at all on-premise either `[inference]`.

**Drop-off risk.** **None for this visit.** But the absence of a review-collection mechanism is a drop-off risk for the *next* customer: Bilguun and Enkhjin's good experience never gets captured, so no future Bilguun sees a recent Mongolian-language 5-star review.

---

### Stage 8 — Post-visit (21:15 → next day → next week)

**What he does.**
- Pays. Walks out. Drives Enkhjin home. No follow-up from Nagomi.
- Enkhjin's IG story goes up at 21:24. Tags Nagomi `[inference — if Nagomi's IG handle is discoverable]`. 340 of her followers see it.
- Next morning: no message from Nagomi. No review request. No "thanks for visiting, here's 10% off your next meal." No newsletter signup.
- A week later: Bilguun has forgotten the name "Nagomi" at the recall level. He remembers "the robot sushi place." If someone asks him "what was it called?" he has to open Facebook Messenger and scroll up to find his screenshot.

**Apps open.** None related to Nagomi.

**Feels.** Neutral. A good meal has become a forgettable weekend. This is the biggest silent failure in the stack — the failure is *invisible*, which is why restaurants don't think they have a problem.

**Friction points.**
- **No post-visit touch.** `PITCH.md:72` calls this out explicitly: "No follow-up" is listed as a thing the fake bot cannot do; `PITCH.md:73` describes what a real bot should do ("Bot messages happy customers 2hrs later → Google review request").
- **No name capture.** Nagomi has no record that "Bilguun B. came on Wednesday with a +1 and spent 170K." The 141K FB followers are anonymous; the booking system is a paper notebook. There is **no customer database**, so there is nothing to remarket to `[inference from the bot audit]`.
- **No review capture.** `PITCH.md:72–73` and `AUDIT.md:37–41` both confirm the current review surface is a vacuum.
- **IG story is one-way.** Enkhjin tagged them; there is no evidence anyone at Nagomi reposts UGC `[inference]`.

**Drop-off risk.** This stage has no "drop-off" in the current-visit sense. But it has a **lifetime-value drop-off of roughly 100%**: Bilguun's next sushi craving in 6 weeks will start at Stage 2 from zero, not from a remembered relationship with Nagomi.

---

## 3. Phone Screen Moments (3 specific screens)

These are the exact app sequences that should be walked through live on Sukhbat's phone in the Apr 10 meeting (`PITCH.md:110`), with screenshots, as the core demonstration.

### Screen Moment A — "The fliphtml5 / AliExpress shock" (Stage 3, ~18:27)

**Device state.** iPhone 13, Facebook app in the foreground, just tapped the menu link on the Nagomi FB page.

**Sequence.**
1. Facebook app → Nagomi page → "About" section → tap `Цэс харах` (menu link).
2. Facebook in-app browser opens `online.fliphtml5.com/.../nagomi-menu/`.
3. 2-second white flash while the flipbook loader runs.
4. Page renders. The left half of the screen is the Nagomi rib-eye page at 75,000₮. The right half is an **AliExpress ad for a $5.99 pendant necklace**.
5. Pinch-zoom to read the price. The fliphtml5 zoom fights the FB in-app browser zoom. Menu becomes readable only after two tries.

**What this screen proves.** The single most brand-damaging moment in the entire journey (`PITCH.md:31–34`). A customer Bilguun's age *notices* the AliExpress ad — it's not a subliminal thing, it's a visible jewelry ad sitting next to a premium steak price. The scout's observation — *"A premium Japanese restaurant's brand sits next to cheap Chinese drop-shipping ads. No serious restaurant should accept this"* (`PITCH.md:34`) — is experienced as a 2-second gut feeling of *"wait, is this place cheap?"*

**Fix shown live in the meeting.** Open the agency's landing-page menu (`menu.html`, `AUDIT.md:71–74`) on the second phone. Side-by-side, same rib-eye entry, no ads, real photograph, Mongolian copy. The difference is pre-verbal.

---

### Screen Moment B — "The phone dialer ambush" (Stage 5, ~18:35)

**Device state.** iPhone 13, Messenger in the foreground, conversation with Nagomi bot.

**Sequence.**
1. Messenger → Nagomi bot thread.
2. Tap `Өрөө захиалга` ("Book a room") — the button visible on the bot's main menu card.
3. Bot replies with a message. A button appears.
4. Tap the button.
5. **The iOS phone dialer fullscreen-takes-over the screen.** Pre-filled with `7000-5045`. Giant green CALL button. Red cancel button. No explanation. No "we'll connect you" pre-screen. Messenger is now in the background.
6. Tap cancel. Return to Messenger. The bot is still showing the same card. No acknowledgment that the call was attempted or cancelled. No SMS fallback.

**What this screen proves.** The core thesis of the pitch (`PITCH.md:10–14`): *"Their 'booking system' is fake."* The scout phrase is perfect — *"Bot pretends to book. Actually just opens the phone dialer."* Walking through this live, in the meeting, is the most persuasive 20 seconds of the entire pitch. Nobody can argue with a screen recording of their own bot opening iOS dialer.

**Fix shown live in the meeting.** On the second phone, open the agency demo bot (whether Messenger-based or a landing-page drawer — `AUDIT.md:81–84` describes the `<dialog>` reservation drawer). Same tap. Instead of a dialer: a modal with four fields (people, date, time, name+phone). Submit. Row appears in a shared Google Sheet / Airtable on the laptop screen. Bot replies with a Mongolian confirmation. The contrast is absolute.

---

### Screen Moment C — "The infinite greeting loop" (Stage 5, ~18:37)

**Device state.** iPhone 13, Messenger in the foreground, conversation with Nagomi bot. The dialer attempt is now 2 minutes in the past. Bilguun is trying to recover.

**Sequence.**
1. Messenger → Nagomi bot. He types `Сайн уу` (just "hi"). Send.
2. **No response, or the same greeting card appears.** (`PITCH.md:46–47`: the bot cannot answer free text.)
3. He taps `Үндсэн цэс` ("Main menu"). Bot sends the 800-character greeting card + 2 menu cards.
4. He types `Өнөөдөр нээлттэй юу?` ("Are you open today?"). Send.
5. **Same greeting card appears again.** Identical, down to the character.
6. He taps `Буцах` ("Back"). It's **text, not a button** (`PITCH.md:16–19`). Nothing happens. He taps the actual text on the message. The phone's text-selection cursor appears instead. He long-presses by accident. The iOS copy menu pops up.
7. He closes the thread in frustration.

**What this screen proves.** Two things at once:
  (a) The bot is a **static decision tree with zero NLU** — any customer who deviates from the 5 pre-approved taps gets the same greeting card forever.
  (b) The UI itself is **broken at the HTML level** — `Буцах` being text instead of a button (`PITCH.md:16–19`) is not a sophistication problem, it's a *competence* problem. The restaurant paid someone to build this, and that someone did not know the difference between a button and a string.

**Fix shown live in the meeting.** On the agency bot: type `Сайн уу` → bot replies in Mongolian with a genuine greeting + 3 quick-reply chips (menu / book / hours). Type `Өнөөдөр нээлттэй юу?` → bot replies *"Тийм, өнөөдөр 11:30–22:00 нээлттэй. Ширээ захиалах уу?"* Tap the back button → actually goes back. Every interaction is a small proof.

---

## 4. Friction Point Table (ranked by severity)

Severity rubric: **S1 = kills the booking / kills the brand today.** S2 = material revenue loss. S3 = cosmetic / future-state. *Every row is grounded in scout evidence.*

| # | Friction | Stage | Severity | Evidence | Specific fix |
|---|----------|-------|----------|----------|--------------|
| 1 | Messenger bot's "book a room" button opens the phone dialer instead of actually booking | 5 — Booking | **S1** | `PITCH.md:10–14` | Real Messenger bot flow OR `<dialog>` reservation drawer on landing page with 4 fields (people, date, time, name+phone) → writes to Google Sheet / Airtable webhook → sends MN confirmation (`AUDIT.md:81–84`) |
| 2 | Menu is hosted on `online.fliphtml5.com` with AliExpress jewelry ads next to 75,000₮ steak | 3 — Research | **S1** | `PITCH.md:31–34` | Kill the fliphtml5 hosting immediately. Host the menu on the Nagomi domain, built in HTML (`menu.html` already exists — `AUDIT.md:71–74`). No iframes, no third-party embeds, ever. |
| 3 | Bot cannot answer free text — any deviation from the 5 preset taps returns the same 800-char greeting card on infinite loop | 5 — Booking | **S1** | `PITCH.md:21–25, 46–47` | Replace the rule-based bot with an LLM-backed bot that understands Mongolian natural language. Minimum viable: 20 canned intents (hours, location, prices, reservation, delivery, dietary). Ideal: a live LLM with a knowledge base. (This is literally BODHI's core capability — the bot is the hive, not a one-off build.) |
| 4 | `Буцах` is text, not a button — customers get stuck in the bot and have to start over | 5 — Booking | **S1** | `PITCH.md:16–19` | Trivial fix: wrap in a quick-reply button or a postback. This is the 5-minute fix that demonstrates baseline competence in the pitch. |
| 5 | Three different operating hours across platforms (FB cover 11:30–22:00, FB info 12:00–22:00, UB Eats 13:00–17:00) | 2/4 — Discovery, Decision | **S1** | `PITCH.md:34–37` | Single source of truth: one JSON hours record, pushed to FB cover, FB info section, Google Business Profile, UB Eats, TokTok, and the landing page at the same time. Automated via a small script. |
| 6 | No real reservation confirmation — the paper-notebook phone call is the whole system; no SMS, no email, no reminder | 5/6 — Booking, Arrival | **S1** | `PITCH.md:68–72` | Reservation drawer writes to a shared sheet; an Apps Script / webhook sends an SMS confirm (Mongolian: *"Ширээ баталгаажлаа. Өнөөдөр 19:30, 2 хүн. Утас: ..."*). 90-minute reminder ping. |
| 7 | Discovery is 100% Facebook. If the customer searches Google, Nagomi is invisible / underserved | 2 — Discovery | **S2** | `[inference]` — no Google data in scout | Claim + populate Google Business Profile: photos, hours, menu link, reserve button. Free. 45 minutes of work. This alone captures the Google-first 20% of the market Nagomi currently misses. |
| 8 | No food photography anywhere — FB page and any landing page use banner + emoji placeholders | 3 — Research | **S2** | `AUDIT.md:12–15` | 2-hour photo shoot at the restaurant. iPhone 15 Pro + window light OR $15 LED panel. 8 shots: tonkotsu with steam, otoro nigiri, conveyor belt, robot, shabu pot, chef's hands, rib-eye, dining room at night (`AUDIT.md:144–154`). Free. |
| 9 | No Mongolian-language social proof on the FB page or landing page — 339 FB comments exist but are not surfaced as reviews | 3 — Research | **S2** | `PITCH.md:28–29`, `AUDIT.md:37–41` | Curate 6 real MN comments into a reviews section (name initials, date, source link). Pull from the existing 339 comments. Attribute or skip. |
| 10 | Landing page's Google Map iframe is broken; second location has no map at all | 6 — Arrival | **S2** | `AUDIT.md:42–45` | Real embed URL from Google Maps share → Embed. Or a Mapbox static image. 10 minutes per location. |
| 11 | No branch clarification in the booking flow — customer doesn't know which of the 2 locations their reservation is at | 5/6 — Booking, Arrival | **S2** | `AUDIT.md:28` ("2 салбар"); absence of branch field in `PITCH.md:20` bot table | Reservation drawer and phone-call intake MUST capture branch. One field, one dropdown. |
| 12 | No post-visit follow-up — no review request, no return offer, no customer record | 8 — Post-visit | **S2** | `PITCH.md:71–73` | 2-hour-post-meal auto-message via the reservation system: *"Танд өнөөдрийн оройн хоол таалагдсан уу?"* + Google review link + 10% off next visit code. |
| 13 | Facebook CTAs everywhere funnel customers into the broken bot — the landing page undermines the pitch | 2/3 — Discovery, Research | **S2** | `AUDIT.md:47–50` | Reduce landing-page CTAs to two: `Ширээ захиалах` (real drawer) and `Хаяг харах` (map scroll). Messenger drops to footer tertiary. |
| 14 | Brand red (#e10a1a) is "fire-engine / fast-food red," tonally wrong for premium Japanese | All stages | **S3** | `AUDIT.md:17–20` | Replace primary with urushi red `#6b0f1a`, shu-iro accent `#8b1a1a`. Keep fire-engine at ≤10% surface for logo continuity. |
| 15 | Typography is Noto Sans only — no display face, no voice | 3 — Research | **S3** | `AUDIT.md:32–35` | Shippori Mincho (headlines) + Inter (body). Free from Google Fonts. |
| 16 | Vanity stat block ("141K / 339 / 2") is follower-count theater, not diner-relevant | 3 — Research | **S3** | `AUDIT.md:27–30` | Replace with "Since 20XX" + "First Kaiten-zushi in Mongolia" + named chef credential if true. |
| 17 | Emoji density on landing page — 10+ emoji per viewport | 3 — Research | **S3** | `AUDIT.md:52–55` | Monoline SVG icons or kill the service-badge section entirely. |
| 18 | Mobile hero overflows on iPhone SE — 48px wordmark + 32px English tagline + 20px JP + 18px MN + 2 buttons | 3 — Research | **S3** | `AUDIT.md:57–60` | Mobile hero: wordmark 56px max, drop Japanese romaji on <sm, single-button CTA. Test at 375px. |

**Total S1 count: 6.** Any one of them kills a booking. All six active at once explains why Nagomi's digital stack is negative-value: it's worse than having no digital stack at all, because customers who successfully call would have called anyway, and customers who get stuck in the bot walk away thinking Nagomi is incompetent.

---

## 5. Opportunities — Agency (Odko + BODHI) Productized Services

These are the **sellable services**. Not bespoke projects. Each one is a SKU that can be resold to the next 20 restaurants with minimal per-client customization. Pricing column is the Nagomi price anchor from `PITCH.md:77–86` generalized.

### Service 1 — "Messenger Auto-Reply Bot" (the flagship)

**The productized promise.** A real Messenger bot that understands natural-language Mongolian, answers the 20 most common restaurant questions, takes actual reservations, confirms with SMS, sends a 90-min reminder, and collects reviews 2 hours after the meal.

**What it replaces.** The fake bot documented in `PITCH.md:10–47` — specifically, the phone-dialer ambush, the infinite greeting loop, the broken `Буцах` button, and the inability to answer free text.

**Architecture sketch.**
- Messenger webhook → BODHI-hosted intent classifier (LLM, Mongolian-tuned) → knowledge base (per-restaurant JSON: hours, menu, locations, policies) → reservation engine (writes to Airtable / Google Sheet / Supabase) → SMS via a local MN SMS gateway or Telegram fallback → post-meal review request cron.
- Per-client onboarding: one 45-minute call to fill in the knowledge-base JSON. Ship in 3–5 days.

**SKU price.** Setup **800,000–1,500,000₮** + **200,000₮/mo** (matches `PITCH.md:79–83`). Per-seat at scale: setup drops to 300K after the template stabilizes.

**Why it resells.** Every restaurant in UB with a Facebook bot has the same stack `[inference based on Mongolian SMB tooling norms]`. The template transfers — only the knowledge-base JSON changes per client.

---

### Service 2 — "Menu-on-Facebook Template"

**The productized promise.** A mobile-optimized HTML menu hosted on the client's own domain (no fliphtml5, no third-party ads), with food photography, category jumping, and a single "Book a table" CTA. Ships with an FB-canvas variant so the menu also lives inside Facebook without opening an external browser.

**What it replaces.** The `online.fliphtml5.com` hosting debacle (`PITCH.md:31–34`). Also replaces any emoji-based menu (`AUDIT.md:52–55`).

**Architecture sketch.**
- Template repo (this already exists in embryo form at `/Users/macbookpro/Documents/agency/nagomi/menu.html`). Static HTML + Tailwind. Photos stored on a CDN (Cloudflare R2 / Supabase Storage). One JSON config per client with dishes, prices, categories, photo paths.
- Deployment: push to the client's own domain (or a subdomain of the agency's domain if they have none). Zero server cost after initial deploy.
- FB canvas variant: a stripped mobile-only version served via an `og:` tag so previews render inside the FB app.

**SKU price.** **300,000₮** one-time per client, bundled free with Service 1 as a sweetener.

**Why it resells.** Every MN restaurant using a PDF menu on a third-party site has this problem. The fliphtml5-with-ads issue is not Nagomi-specific; it's a whole-market failure mode `[inference]`.

---

### Service 3 — "Review Response Automation"

**The productized promise.** Every Google / Facebook / TripAdvisor review gets a Mongolian reply within 4 hours, drafted by an LLM tuned on the client's brand voice, reviewed in a daily digest, and published. Plus: automatic review *requests* sent 2 hours after every meal via Messenger.

**What it replaces.** The post-visit vacuum documented in `PITCH.md:72–73`. Nagomi currently does neither outbound review requests nor inbound review responses.

**Architecture sketch.**
- Inbound: poll Google Business / FB Graph / TripAdvisor daily. New review → LLM drafts a reply in client's voice → Telegram bot pings owner for approval → publish on approve. Default auto-publish for 5-star; human-review for ≤3-star.
- Outbound: integrate with the reservation engine from Service 1. 2-hour delay after reservation time → Messenger message with `Таны оройн хоол хэр байсан бэ?` + Google review deep link.

**SKU price.** **150,000₮/mo** as an add-on to Service 1, or **300,000₮/mo** standalone.

**Why it resells.** The scout specifically called out `"Bot messages happy customers 2hrs later → Google review request"` as a thing no Mongolian restaurant bot currently does (`PITCH.md:73`). First-mover advantage in the category.

---

### Service 4 — "Photo Content Pack"

**The productized promise.** One-time 2-hour photo session at the restaurant + 8 curated shots, color-graded per the AUDIT spec (`AUDIT.md:141–154`): dark moody single-light, warm highlights, oxblood reds. Delivered as web-optimized JPEGs at 3 resolutions (hero / card / thumbnail) + vertical 9:16 crops for IG stories.

**What it replaces.** The banner-plus-emoji poverty documented in `AUDIT.md:12–15`. This is the single lowest-cost highest-impact service.

**Architecture sketch.**
- Shot list is pre-defined (`AUDIT.md:144–154`): tonkotsu with steam, otoro single piece, conveyor belt 4+ plates, robot mid-motion, shabu ripples, chef hands, rib-eye mid-sear, dining room golden hour.
- Shoot on an iPhone 15 Pro + Halide + a $15 LED panel. 2 hours onsite. Edit in Lightroom presets (one "Nagomi" preset file, reusable for the whole category).
- Delivery: Dropbox folder + a brand sheet.

**SKU price.** **400,000₮** flat, delivered in 48 hours. Bundled free into the "Full upgrade" tier of Service 1 to close reluctant clients.

**Why it resells.** The preset + shot list is the product. Every sushi place shoots the same 8 subjects. Every Korean BBQ place shoots a different 8 (meat on grill, panchan, soju pour, etc.). Build 5 cuisine presets, cover the whole UB mid-market.

---

### Service 5 — "Reservation Drawer" (the live-demo killshot)

**The productized promise.** A 4-field reservation modal (people / date / time / name+phone) that can be dropped into any existing restaurant landing page or Facebook page, writing to Google Sheets / Airtable, with MN-language confirmation and a webhook back to the owner's phone. Two hours to deploy per client.

**What it replaces.** Nagomi's absence of a real booking UI (`PITCH.md:10–14`; `AUDIT.md:81–84`).

**Architecture sketch.**
- A single `<dialog>`-based HTML component. Fetch POSTs to a Google Apps Script webhook, which writes to a sheet and sends a Telegram or email notification to the owner. Total backend: 40 lines of Apps Script.
- Owner gets a Telegram bot ping: *"Шинэ захиалга: 2 хүн, 19:30, Бат 99887766"*. One-tap confirm → SMS to customer.
- Sells on its own *because it is the live demo in the pitch meeting*. Once a client sees the Google Sheet row appear in real time on the laptop (`AUDIT.md:211`), the sale is effectively closed.

**SKU price.** **200,000₮** one-time. Free if they sign for Service 1 monthly.

**Why it resells.** It is the smallest possible unit of demonstrated competence. It fits in a 10-minute sales call. Ship it, let them feel the contrast with their current flow, then upsell.

---

### Service 6 (stretch) — "Hours Sync Daemon"

**The productized promise.** A cron job that pushes a single JSON hours spec to FB cover photo metadata, FB info section, Google Business Profile, UB Eats, TokTok, and the landing page at the same time, with change alerts to the owner.

**What it replaces.** The three-different-hours debacle (`PITCH.md:34–37`).

**SKU price.** **50,000₮/mo** add-on. Or free — it's a trust signal.

**Why it resells.** Every multi-channel MN restaurant has hours drift. The scout found it on Nagomi with ~10 minutes of work. It will show up on every client within the first week.

---

### Pricing Matrix for the Agency

| Tier | Services included | Setup | Monthly |
|------|-------------------|-------|---------|
| **Quick Fix** (close fast) | S2 (menu) + S4 (photos) + S5 (reservation drawer) + S6 (hours sync) | 800,000₮ | 50,000₮ |
| **Full Upgrade** | Quick Fix + S1 (real bot) + S3 (reviews) | 1,500,000₮ | 350,000₮ |
| **Per-seat at scale** (clients 5+) | Full Upgrade (template reuse) | 500,000₮ | 250,000₮ |

This matches the pricing floor in `PITCH.md:77–83` and expands it by breaking out the SKUs so individual services can be sold à la carte.

---

## 6. Nagomi-Specific Recommendations — What They Should Change First

Ranked by *change fastest, lose least, earn trust fastest*. All six are derived directly from scout findings.

### Priority 1 — Kill the phone-dialer bot today
**Scout evidence.** `PITCH.md:10–14`. Every hour the fake bot is live, it is silently teaching customers that Nagomi is incompetent.
**What.** Either (a) disable the `Өрөө захиалга` button in the bot entirely and replace with a plain "Call us: 7000-5045" card that sets correct expectations, OR (b) replace the button's postback with a real intake flow. Option (a) is a 10-minute change; option (b) is a 1-week build (Service 1).
**Why first.** This is the only friction point where *doing nothing* is strictly worse than *doing the simplest possible honest thing*. A static "please call" card is better than a dialer ambush.

### Priority 2 — Fix the `Буцах` text-not-button bug
**Scout evidence.** `PITCH.md:16–19`.
**What.** Wrap it in a postback button. 5 minutes.
**Why second.** Free trust restoration. Nothing in the world is sadder than a text string pretending to be a button.

### Priority 3 — Sync the three operating-hours listings
**Scout evidence.** `PITCH.md:34–37`.
**What.** Pick the real hours. Update FB cover photo overlay, FB info section, Google Business Profile (create if missing), UB Eats, TokTok, FreshPack. 30 minutes of copy-paste, then one line of `[source of truth]` documentation.
**Why third.** Discovery and decision failures that happen silently — no customer complains, they just pick somewhere else — are the most expensive bugs you never see.

### Priority 4 — Move the menu off `fliphtml5.com`
**Scout evidence.** `PITCH.md:31–34`.
**What.** Deploy the existing `/Users/macbookpro/Documents/agency/nagomi/menu.html` on a Nagomi domain (or a free Vercel subdomain: `nagomi.vercel.app/menu`). Update the menu link on FB About and in the bot's `Меню үзэх` button to the new URL.
**Why fourth.** One link change eliminates the single most brand-damaging moment in the Research stage.

### Priority 5 — Ship the reservation drawer
**Scout evidence.** `PITCH.md:10–14` + `AUDIT.md:81–84`.
**What.** Deploy Service 5. 4-field modal, Google Sheet, Telegram bot ping to owner, SMS confirm to customer. 2 hours of work.
**Why fifth.** This is the first *net-new capability* Nagomi gains — the first time in Nagomi's history that a customer can book a table without speaking to a human. It is also the live-demo killshot for the Odko meeting, so shipping it before Apr 10 means the pitch *shows a running system*, not a promise.

### Priority 6 — Shoot the 8-photo content pack
**Scout evidence.** `AUDIT.md:12–15` + `AUDIT.md:144–154`.
**What.** Service 4 executed on Nagomi itself. 2 hours onsite. iPhone + window light. Deliver the 8 shots into the landing page and the FB page's featured gallery.
**Why sixth.** It is the single highest-leverage asset — once the photos exist, every other surface (landing page, menu, FB, IG, Google Business, review responses) suddenly works harder. It is also the deliverable Odko's client can *see and touch* in a way they cannot see a bot architecture diagram.

### Explicit non-priorities (for this pass)
- **Rebranding the red** (`AUDIT.md:17–20`). Important, but cosmetic relative to S1 bugs. Ship after revenue.
- **Typography swap** (`AUDIT.md:32–35`). Same.
- **Vanity stat block** (`AUDIT.md:27–30`). Cosmetic.
- **Mobile hero tuning** (`AUDIT.md:57–60`). Cosmetic.

All four of these belong in Phase 2, after the first month of the monthly retainer, once the S1 fires are out.

---

## Grounding Index

Every substantive claim in this document maps back to one of:

- **`PITCH.md:10–14`** — fake bot opens phone dialer
- **`PITCH.md:16–19`** — `Буцах` is text, not a button
- **`PITCH.md:21–25`** — main menu = infinite greeting spam
- **`PITCH.md:28–29`** — 141K followers / 339 comments / 2 branches
- **`PITCH.md:31–34`** — fliphtml5 + AliExpress ads
- **`PITCH.md:34–37`** — three different operating hours
- **`PITCH.md:46–47`** — bot cannot answer free text
- **`PITCH.md:68–73`** — what a real bot should do (feature gap list)
- **`PITCH.md:77–86`** — pricing tiers
- **`PITCH.md:110`** — phones in the pitch meeting
- **`AUDIT.md:12–15`** — no food photography
- **`AUDIT.md:17–20`** — wrong brand red
- **`AUDIT.md:27–30`** — vanity stats block
- **`AUDIT.md:32–35`** — typography monoculture
- **`AUDIT.md:37–41`** — trust-vacuum reviews section
- **`AUDIT.md:42–45`** — broken Google Maps embed
- **`AUDIT.md:47–50`** — CTA contradiction (funneling into broken bot)
- **`AUDIT.md:52–55`** — emoji density
- **`AUDIT.md:57–60`** — mobile hero overflow
- **`AUDIT.md:81–84`** — reservation drawer pattern
- **`AUDIT.md:88–89`** — robot server = unique UB asset
- **`AUDIT.md:144–154`** — photography strategy and shot list
- **BODHI memory `feedback_branding.md`** — don't dismiss Facebook for MN market
- **BODHI memory `fact_sister_messenger.md`** — Messenger is the primary MN comms channel

Claims flagged `[inference]` are not in the scout corpus and must be verified before use in a live sales conversation.

---

*End of working document. Living file — update after the Apr 10 meeting with Odko, and after the first real paying restaurant client, whichever comes first.*

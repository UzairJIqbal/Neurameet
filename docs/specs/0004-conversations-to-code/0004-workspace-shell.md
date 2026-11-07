# W8. Workspace shell, personal views, notifications, and Ctrl K

Child of [0004. Conversations to Code](index.md). Uses the W8 SQL block (`notifications`, `user_settings`, the PDF fields, `task_comments`) and the configuration list (`CRON_SECRET`, `RESEND_WORKSPACE_FROM`, `vercel.json`). Deepened in place by `/architect` on 2026-11-07, then widened the same day to follow `context/designs/NeuraMeet-UI-Overview.pdf` screen by screen. Build W7 first: this step mounts W7's Assistant panel as a tab.

## Summary

This step ties the workspace together and makes it match the PDF. A project page gets the PDF's header and nine tabs. The sidebar becomes My Dashboard, My Tasks, My Meetings, My Projects, Notifications, and AI Assistant, with project shortcuts and counts. Projects gain a description, status, type, icon, and color. Tasks gain a priority and comments. The board gains a list view and filters. GitHub gets its own tab, and you can connect your GitHub account in Settings. You get a bell, an optional email for each event, and one morning digest. Ctrl K (Cmd K on a Mac) jumps to any project, task, meeting, or decision you can see. Two new color tokens (success and warning) arrive for task and status states.

Where the PDF collides with a locked decision in `AGENTS.md`, a code level rule, or the zero cost rule, the lock wins. See "What stays out of the PDF" under Design.

## Requirements

**User stories**:
- As a member, you want one page for your tasks across projects, so you see what is due without opening each project.
- As an Owner or Admin, you want a notice when proposals or join requests wait for you, so nothing sits unseen.
- As a member, you want a quick jump from anywhere, so you never hunt through menus.
- As a new project Owner, you want every tab to tell you what to do next, so an empty project is never a dead end.
- As a project Owner, you want to give a project a description, status, type, icon, and color, so your project list reads at a glance.
- As a Developer, you want to set a priority and leave comments on a task, so the work is discussed where it lives.
- As a Developer, you want a GitHub tab and a notice when someone asks you to review a pull request, so you see what waits for you.
- As an invited person, you want to see what you are joining before you accept, and to decline in one click.

**Project page**

- **AC-70**: The project page has tabs in the PDF's order: Overview, Meetings, Tasks, Members, GitHub, Development Activity, Decisions and Promises, AI Assistant, Settings (keys `overview`, `meetings`, `tasks`, `members`, `github`, `activity`, `promises`, `assistant`, `settings`), with Overview the default. "Decisions and Promises" keeps its locked name at the PDF's Decisions position. Owner and Admin see all nine, a Developer sees all but Settings (GitHub is read only), and a Viewer sees all but GitHub, AI Assistant, and Settings. The server still checks every route.
- **AC-70a**: Old links keep working: `?tab=board` and `?tab=proposals` open Tasks. `?tab=github` is now its own tab, so the GitHub callback redirect and its `?github=` toast land there unchanged. An unknown tab, or one your role cannot see, opens Overview. A Viewer on `?tab=github` opens Overview and sees no toast.
- **AC-70b**: Overview shows stat cards (Members; Meetings with the upcoming count; Total tasks; Completed; Pending with the blocked count; Overall progress as a percent of tasks completed), a donut of tasks by status with each count, an "Open board" link, the next scheduled project meeting with Join, what waits for review (pending proposals and promises to review, each linking to its tab, hidden from Viewers), the latest 5 activity rows, the latest 5 tasks, Team (first 5 members and the count), and a repository card. One failed call blanks only its own card. A "Prepare" button on the next meeting card calls `POST /api/prep` with the meeting title, only on click, shows the result inside that card, and is hidden from Viewers. No AI call runs when the tab loads. The donut is plain SVG using tokens, with no chart library.
- **AC-70c**: Tasks opens with a Review section holding `ProposalsPanel` and its count. It is hidden from Viewers, read only for Developers, and not shown at zero proposals. Confirming or merging a proposal reloads the board: the Tasks tab owns a `reloadKey`, passed to `TasksBoard` and raised by a new `onChanged` prop on `ProposalsPanel`. `?task=<id>` opens the task drawer, closing it removes the param, and a task you cannot read shows a toast and removes the param.
- **AC-70d**: Meetings lists the project's meetings from `GET /api/meetings?projectId=`, with search, a date filter (Any date, Next 7 days, Last 7 days, Last 30 days), and status chips (All, Scheduled, Ended). Upcoming holds every `status = 'scheduled'` row, soonest `started_at` first, with Join to `/meeting/<stream_call_id>` and a "Time passed" label when `started_at` is behind now. Meeting History holds every other row, linking to `/meeting-intelligence/<id>`. Each row shows a date block, status chip, time, duration (only when both ends are known), Organizer, type tag, invited avatars, and an "N tasks to review" chip (not for Viewers). A right column, AI Meeting Summaries, lists up to 5 processed meetings with title, date, a summary excerpt of 160 characters, decision count, action item count, and the awaiting review count (not for Viewers). All filters run on the loaded list. Developers and higher get "Schedule Meeting", which opens `MeetingModel` with this project already picked.
- **AC-70e**: Settings holds project details (name, description, status, type, icon, color), Transfer ownership, and Delete project, all Owner only through the existing and extended routes. An Admin sees the details read only, with a line saying only the Owner changes them. Transfer and Delete leave `MembersTab`, and Sync leaves `TasksBoard` for the GitHub tab and the More menu.
- **AC-70f**: Each tab shows the empty state in the table under Design in a fresh project, with its action only for roles that may use it.
- **AC-70g**: Every tab sits under one project header: icon in its color, name, status badge, your role badge, description, Owner, up to 5 member avatars with the count, and GitHub status. GitHub status shows the repo name and "Synced <age>" when a repo is linked and the name may be shown, "Repository connected" when it may not, and "GitHub not connected" otherwise. Buttons: Add Member (Owner, Admin), Schedule Meeting (Developer or higher), and More with Project settings (Owner, Admin), Copy link (everyone), Sync GitHub (Owner, Admin, when connected), and Leave project (everyone but the Owner, through the existing confirm and route).
- **AC-70h**: New Project asks for name, description (optional, up to 500 characters), project type (Web, Mobile, AI/ML, Backend, Other), icon, and color, with a live preview. The task prefix, which the code needs, starts from the name's initials and stays editable under the preview. A "Connect GitHub next" choice is off by default. Members are added after creation, and the creator becomes Owner. A success screen follows with Open project, and Connect GitHub when chosen, which opens `?tab=github` (the signed install state needs the project id, so connecting cannot happen before create).
- **AC-70i**: The GitHub tab reads `GET /api/projects/[id]/github/summary` (Developer or higher, Viewer 403). It shows each linked repo's name, Private or Public, default branch, and last sync, with Sync now (Owner, Admin), Disconnect (Owner, the existing unlink route with a confirm), and stat cards for open linked PRs, merged linked PRs, and linked tasks. Sub views: Overview, Pull Requests (number, title, author, state, merge status, task key, a link out to GitHub), and Settings (read only text for the automation rules in [0004-github.md](0004-github.md) and the webhook events). The Owner's connect and link flow stays in `GitHubTab`, shown when nothing is linked and behind "Manage repositories". Counts and rows cover only PRs linked to tasks and are labelled so.
- **AC-70j**: Members has search, role chips with counts, and a table: Member (avatar, name, email), Role (a select for those who may change it under the role matrix, a label otherwise), GitHub username (when that member connected one), Open tasks (count only, never done counts), Joined, and an actions menu (Remove, Leave). Owners and Admins also see Pending Invitations with the count, each with its expiry, Resend (email kind only), and Revoke, and join requests with Approve and Reject.
- **AC-70k**: Add Members has two tabs. Invite by email takes up to 10 addresses separated by Enter or a comma, plus one role, and sends one `POST /api/projects/[id]/invitations` per address, listing the result per address, with a copy link fallback for each when email is off. Invitation link generates a link, copies it, shows the expiry, and offers Disable (revoke). The Admin role card is disabled on the link tab, and a fixed line says the Owner or Admin always approves link requests, since W2 never allows a link to skip approval. `POST /api/projects/[id]/invitations/[invitationId]/resend` issues a fresh token on an email invite, resets its expiry to 7 days, sends through the shared budget, and returns the link once; the old link stops working.
- **AC-70l**: Decisions and Promises adds search, a meeting select, and tag chips, on top of W6's kind and status filters. A tag is the source meeting's `meeting_insights.category`; no new AI tags are made per item. Each card also shows source meeting, date, and up to 5 participant avatars from `meeting_participants`. Clicking the source meeting opens it. `GET /api/projects/[id]/ledger` adds `?meetingId=&q=&tag=`, filtered in SQL, and `q` matches `statement` only, never `quote`, so a Viewer cannot probe a hidden quote.
- **AC-70m**: The tab is labelled Development Activity and adds chips All, GitHub, Tasks, Meetings, Members with counts, an Everyone select, a search box, and rows grouped by day. `GET /api/projects/[id]/activity` adds `?category=&actorId=`, filtered in SQL through allowlisted kinds, and returns `categoryCounts`. Search filters the rows already loaded and says so, because the view stores no text. No commit rows appear here. `task.commented` joins the allowlist and shows no comment text.
- **AC-70n**: AI Assistant mounts W7's panel with a heading "Ask anything about <project>", New chat, up to 4 fixed suggested question chips that fill the input (W7's panel gains an optional `prefill` prop), and a Project Memory panel with counts of processed meetings, decisions, tasks, and linked PRs, from `GET /api/projects/[id]`. The PDF's commit and issue counts are not shown, since nothing stores them. The empty state from the table applies when the project has no meetings.

**Tasks**

- **AC-70o**: Every task has a priority: Low, Medium, High, or Urgent, default Medium. `POST /api/projects/[id]/tasks` and `POST /api/proposals/[id]/review` accept `priority?`, and `PATCH /api/tasks/[id]` accepts it under the same rule as other edits, writing an `edited` event with field `priority`. The AI never guesses a priority: a proposal starts at Medium and the reviewer may change it. A bad value is 422.
- **AC-70p**: The Tasks tab has search, priority, assignee, and status filters, a Board and List toggle (remembered per browser), and Add Task. Board columns are To Do, In Progress, In Review, Completed, and Blocked, each with its count, and each but Completed has a `+`. Completed has none, since completing needs an evidence note. A `+` creates the task, then moves it through PATCH under the same rules; if the move fails, a toast says the task was created in To Do. Cards show key, priority, title, Meeting chip when it came from a meeting, PR refs, assignee, due date, and comment count (the last three hide what a Viewer may not see). List shows the same fields as a table. Dragging is off while any filter is on, because positions would be relative to a partial list, and a line says so.
- **AC-70q**: The task drawer shows editable status, assignee, priority, and due date, plus created date, meeting source, description with Edit, the GitHub section (linked PRs and, for Developer or higher, "Show commits"), completion evidence, comments, and activity history. "Show commits" calls `GET /api/tasks/[id]/commits`, which reads up to 30 commits for each of up to 5 linked PRs from GitHub on click, stores nothing, and returns short sha, first message line, author login, and URL. A failed read shows a message there and blanks nothing else. The simulator stays out.
- **AC-70r**: Comments live in `task_comments`, plain text, 1 to 2000 characters. `GET /api/tasks/[id]` returns the latest 50 with author names and `commentsTruncated`, and never returns comments or the count to a Viewer. `POST /api/tasks/[id]/comments` needs Developer or higher on any task in the project, and writes a `commented` event with no comment text. `DELETE /api/tasks/[id]/comments/[commentId]` allows the author or an Owner or Admin. A removed member's comments stay, shown as "Former member" when Clerk has no name.

**Invitations**

- **AC-70s**: The invite page shows inviter, project icon, name, and description, "You'll join as <role>", counts of members, tasks, and meetings, Created, and the invite's age, with Decline and Accept. `GET /api/invitations/preview` adds these. Team names appear only on an email invite whose address matches your verified email; a link invite shows only the member count, since a link can spread. The repository name appears only for a public repo, otherwise "Repository connected". Decline on a link invite just leaves. Decline on a matching email invite uses the `invitationId` the preview returns and `POST /api/invitations/mine/[id]`. Opening the page still grants nothing.
- **AC-70t**: My Projects shows a banner with Review invitation when `GET /api/invitations/mine` finds active email invites for your verified primary email (through `emailMatchesInvite`, never a token, and empty when your email is unverified). `POST /api/invitations/mine/[id]` takes `{ decision: "accept" | "decline" }`, runs the same join as the token path, and returns 404 unless the invite is active and the email matches. Decline sets `declined_at` and writes an `invite.declined` audit row. A declined invite no longer counts as active: the token route answers 410 and the pending list hides it.

**Meetings**

- **AC-70u**: Schedule Meeting adds description (optional, up to 1000 characters), end time (optional, after the start), meeting type (Code Review, Sprint Planning, Architecture, Standup, Other), and participants on a project meeting, defaulting to all active members. `createScheduledMeetingRow` stores them and rejects an invited id that is not an active member. The participants list drives display and the notice only. It never decides who may join, and it never writes `meeting_participants`, which holds recorded consent.
- **AC-70v**: Meeting Details adds to its header the type chip, project chip, date and time, organiser, description, participants, and Export summary (a client side `.txt` download of the summary, no new route). Tabs become Overview, AI Summary, Transcript, Decisions and Promises, Action Items, Recording, Category, Minutes, Engagement, AI Chat, keeping every shipped tab, because Minutes, Engagement, and the Ledger have no other home. Transcript is new, reads `transcriptText` from `GET /api/meetings/[id]`, and is hidden from Viewers, with the route leaving the field out for them.
- **AC-70w**: On a project meeting, Action Items mounts `ProposalsPanel` filtered by `meetingId`, under a "Human review required" banner. Each proposal has a checkbox and its quote, suggested assignee, priority, due date, Edit, and Dismiss. "Confirm and Create Tasks (N)" calls `POST /api/proposals/[id]/review` once per selected row and lists failures per row. A row with no verified quote still needs its own `confirmWithoutQuote` step and is never confirmed by the bulk button. Developers see it read only, and Viewers see only confirmed items, as today.
- **AC-70x**: The call room adds a Raise hand button using `call.sendReaction` with type `raised-hand`, which appears in the SDK's default reactions. Verify it with the `stream-react` skill and the installed types before coding, and confirm the `project` call type grants it to members. The recording indicator and timer already exist and stay. Captions and live transcript stay out.
- **AC-70y**: Sign In, Sign Up, and Forgot Password move into the PDF's layout with its side panel, around the existing forms and flows, including Continue with Google, which `SignInForm` already has. "Remember me" stays out, since Clerk owns session length.

**Notifications and email**

- **AC-71**: Notifications are written for: `task_assigned` (to the new assignee on task create, proposal confirm, and a task PATCH, only when the new assignee is set, differs from the old one, and is not you), `proposals_ready` (Owner and Admins, once per processed meeting, only when at least one proposal was written), `join_request` (Owner and Admins), `join_approved` (the requester), `task_completed_by_merge` (the assignee, none when unassigned, only when `apply_merge_completion` returns `completed`), `task_reopened_by_revert` (the assignee, none when unassigned, only when `apply_merge_revert` returns `reopened`), `kept_suggestion` (Owner and Admins, on `completed` and `already_completed`). Each insert uses `on conflict (user_id, dedupe_key) do nothing` with these keys: `task_assigned:<taskId>:<version>`, `proposals_ready:<meetingId>:<processedAt>`, `join_request:<requestId>`, `join_approved:<requestId>`, `task_completed_by_merge:<taskId>:<mergeSha>` (the PR number when `merge_sha` is null), `task_reopened_by_revert:<taskId>:<revertPr>`, `kept_suggestion:<ledgerLinkId>`. A failed insert is logged and never fails the main action.
- **AC-71a**: Title, body, and link follow the table under Design. They never hold a quote, transcript text, or a PR title. `notify` rejects a link that does not start with one `/`.
- **AC-71b**: Also written: `meeting_scheduled` (invited members except the scheduler, on a new project meeting or a changed start time), `task_due` (the assignee of each open task due today, from the cron), `project_invitation` (an email invite whose address matches an existing Clerk user with a verified email; the inviter's response stays the same either way, so nothing reveals who has an account), `member_role_changed` (the member, not when they changed it themselves, which is already impossible), `member_joined` (Owner and Admins except the person who joined or approved), and `pr_review_requested` (the requested reviewer, matched on `user_settings.github_user_id`, only when an active Developer or higher in that repo's project). Team review requests are ignored. Dedupe keys: `meeting_scheduled:<meetingId>:<startsAt>`, `task_due:<taskId>:<dueDate>`, `project_invitation:<invitationId>`, `member_role_changed:<projectId>:<userId>:<auditId>`, `member_joined:<projectId>:<userId>:<joinedAt>`, `pr_review:<repoId>:<prNumber>:<githubUserId>`. No meeting reminders are sent.
- **AC-71c**: `meeting_scheduled`, `join_request`, `proposals_ready`, and the older kinds email as in AC-74. `task_due`, `project_invitation`, `member_role_changed`, `member_joined`, and `pr_review_requested` pass `email: false`: the digest already covers due tasks, an invite already has its own email, and the others would burn the small budget. `notify` gains that option.
- **AC-72**: The bell shows the unread count (99+ above that) and the latest 20, with "Mark all read" and "View all". Clicking a row marks it read and opens its link. `GET /api/notifications` pages by `cursor` and takes `?unread=1&category=`, filtered in SQL. `POST /api/notifications/read` marks only the caller's rows, and takes `{ ids, unread: true }` to mark rows unread. Both, and the unread count, only cover projects you are an active member of, so a removed member never holds a dead link. `project_invitation` is the one exception, since you are not a member yet.
- **AC-72a**: `/notifications` says "<n> unread, only notifications addressed to you", lists all your notifications 20 at a time with Load more, and has filters All, Unread, Tasks, Meetings, GitHub, Projects with counts (`categoryCounts` from the route, mapped by `NOTIFICATION_CATEGORIES`), "Mark all as read", a read or unread toggle on each row, and an empty state. Each row shows icon, title, body, category, age, and project. `?filter=github` opens that filter.
- **AC-73**: The bell refetches on window focus and every 60 seconds while the tab is visible (no realtime). A failed refetch keeps the last data and shows no toast.
- **AC-74**: An event email goes only to a newly inserted row, and only when `RESEND_WORKSPACE_FROM` is set, the recipient's `user_settings.email_notifications` is true (missing row means true), and the workspace event budget for today (UTC) is not spent: fewer than 60 sent, counting `notifications.emailed_at` plus `audit_log` `invite.emailed`. Invites share this budget: `workspaceEmailBudgetLeft` in `src/lib/invitations.ts` also counts `emailed_at`. The subject is the notification title. The email has the title, body, an absolute link from `NEXT_PUBLIC_APP_URL`, and a Settings link to turn email off, all escaped with `escapeHtml`. A failed send is logged and leaves `emailed_at` null. It is not retried.
- **AC-75**: `POST /api/settings/notifications { emailNotifications?, digestEmails? }` upserts `user_settings`, and `GET /api/settings/notifications` returns both stored values (true for a missing row). The Settings toggle shows the server value once loaded, keeps the local value if that read fails, and on change calls POST alongside its localStorage write. A failed POST shows a toast and keeps the local value. The digest toggle has no local copy.
- **AC-76**: `GET /api/cron/daily` (`maxDuration = 60`) returns 401 unless `Authorization` is `Bearer CRON_SECRET`, and always returns 401 when `CRON_SECRET` is unset. It runs four jobs in order, each in its own try/catch: purge `github_deliveries` older than 30 days, write `task_due` notifications (at most 200 tasks, oldest created first), send digests (AC-76a), then GitHub Sync for projects with open or draft links (oldest `task_links.last_synced_at` first, at most 5 projects, 100 PR reads per project, skipping the Sync route's cooldown). No new project starts with under 5 seconds left of the 50 second run budget, and each project's Sync gets at most the time left. It returns counts and the names of failed jobs, never an email address.
- **AC-76a**: A digest goes to a user with at least one assigned open task due today or overdue (PKT day) in an active project, or an unread notification from the last 24 hours, whose email toggle (as in AC-74) and `digest_emails` are both on. The sender must be set, or the job sends nothing and claims nothing. At most 20 a day, counting `digest_sent_on = today`, oldest `digest_sent_on` first (a missing row or null first) so the cap never starves the same people. The code claims the day before sending, so a rerun never sends twice: insert the `user_settings` row with on conflict do nothing, then update `digest_sent_on = today` where it is null or before today, returning the row. No row back means skip. A failed send is logged and that day's digest is lost. The subject is "Your NeuraMeet digest". The email lists up to 5 tasks by key and title, the unread count, and a Settings link.

**Personal views**

- **AC-77**: `/my-tasks` lists your assigned tasks across active projects from `GET /api/my-tasks`, with tabs All, To Do, In Progress, In Review, Completed, and Overdue, each with its count, plus search, a project filter, and a sort (due date, priority, updated) run on the loaded list. Columns: Task and project, PR refs, Priority, Due, Status, with a row opening the task drawer in its project. The route returns open tasks capped at 200 by due date (nulls last) plus your latest 50 completed, and `truncated`, which shows a line saying more exist. PR refs follow the Viewer rule per project. There is an empty state.
- **AC-77a**: The sidebar is My Dashboard (`/dashboard`), My Tasks with its open count, My Meetings (`/meeting-intelligence`, same route) with its upcoming count, My Projects (`/projects`), Notifications with its unread count, and AI Assistant (`/ai-chat`, relabelled). A PROJECTS section lists up to 5 shortcuts plus "All projects", with a `+` that opens New Project. A small More group keeps the shipped Follow-ups and Personal Room. Settings and your user block sit at the bottom. The sidebar collapses to icons, remembered in `localStorage` inside try/catch. `/recording`, `/previous`, `/upcoming`, `/prep`, and `/search` leave the sidebar but keep working. A link is active on its path and paths under it. `GET /api/my-counts` feeds the counts and refetches on the bell's timing. `isProtectedRoute` adds `/my-tasks(.*)`, `/notifications(.*)`, `/search(.*)`, `/prep(.*)`, `/profile(.*)`.
- **AC-77b**: My Dashboard shows the date, a greeting, and chips for open tasks, tasks due this week, and upcoming meetings. Below: Upcoming Meeting (type chip, "starts in", title, project, time, participants, Join, the next two, and View all, defined as the earliest future `scheduled` rows from `GET /api/meetings`), Quick Actions (New Project, New Meeting, AI Assistant, and Review PRs with "<n> waiting for you", opening `/notifications?filter=github`), My Projects cards, My Focus Tasks (top 5 from `GET /api/my-tasks` with status chips), and a Notifications card with View all. Recent meetings and follow ups stay beneath them, as shipped features. The dead Bell and the local "Search anything" filter go. No global activity feed, scoreboards, or rankings, and My GitHub Contributions stays out.
- **AC-77c**: My Meetings adds a project chip on project rows, a filter (All, Personal, each project), and an Upcoming section with Join, defined as in **AC-70d**.
- **AC-77d**: My Projects has New Project, the invitation banner (AC-70t), search, status filters (All, Active, Planning, On Hold, Completed), and a Grid and List toggle (remembered per browser). A card shows icon, name, your role, status, description, Owner, repo or "No repository", "N of M tasks complete" with a bar, next meeting, member avatars, and Updated. The Viewer repo rule applies per project. `GET /api/projects` returns all of this using `project_task_counts` and one Clerk batch, never one query per project.
- **AC-77e**: The header shows breadcrumbs, a search box reading "Search projects, tasks, meetings..." with the Ctrl K hint, the bell, Help (a dialog with shortcuts and how a promise reaches a merge; static text), and your avatar menu: My Profile (`/profile`, Clerk's `UserProfile`), Account Settings (`/settings`), Connected Accounts (`/settings?tab=connected`), and Sign Out. This replaces `UserButton`, and the header shows on every shell page.
- **AC-77f**: `/settings` has side tabs. Account: password through Clerk's profile, and the digest toggle. Notifications: the existing email, AI auto summary, and desktop reminder toggles. Appearance: start with the sidebar collapsed. Connected Accounts: AC-77g, plus Google status and connect through Clerk. A dark theme stays out, since the locked tokens are light only.
- **AC-77g**: Connected Accounts shows your GitHub username with Disconnect, or Connect. `GET /api/settings/github` returns status and an authorize URL carrying a signed state with its own HKDF info (`account-state`), so install state and account state can never stand in for each other. `/api/github/callback` tells the two apart by the state's prefix. On the account path it checks the state's user id against yours, exchanges the code, reads `GET /user` for login and id, stores only `github_login` and `github_user_id`, discards the token as W5 requires, and redirects to `/settings?tab=connected&github=<outcome>`. An id already linked to someone else returns the outcome `already_linked`. `DELETE /api/settings/github` clears both values and touches no installation or claim. Connecting never grants repo access or changes a task.

**Palette and tokens**

- **AC-78**: Ctrl K or Cmd K on any shell page opens a `cmdk` palette with Projects, Tasks (by key or title), Meetings (project meetings from your active projects plus your own personal meetings), and Decisions, from one `GET /api/projects/search` call debounced 200 ms, with the previous call aborted and `cmdk`'s own filter off (`shouldFilter={false}`). Escape closes it. The header search box opens it, so it works on touch screens. It never lists rows from projects you are not an active member of.
- **AC-78a**: The last row is always "Search meeting content", which opens `/search?q=<text>` and runs that search once. `/search` reads `q` for this. With an empty query the palette shows Go to links: Recordings, Previous Meetings, Upcoming Meetings, Prep, Search. Typing never calls embeddings.
- **AC-78b**: Decisions matches `ledger_items.statement` where `kind = 'decision'`, never `quote`, in your active projects and your own personal meetings. A project row links to `?tab=promises&meetingId=<id>` and a personal one to its meeting.
- **AC-79**: `context/ui-tokens.md` gains the success and warning tokens under Design, then `tailwind.config.ts`. Light values only, as the token file is light only. They are used for the Completed state (success), and the Blocked state and overdue badge (warning). No raw color classes or hex values are added.
- **AC-79a**: The PDF is used for layout and information architecture, so its colors do not apply. Priority maps to tokens: Urgent `error`, High `warning`, Medium `primary`, Low `secondary`. Project status maps: Active `success`, Planning `secondary`, On Hold `warning`, Completed `primary`. A project color stores a token key, never a raw value.

## Decision

Follow the PDF screen by screen around the current routes: tabs by key with aliases for old links, sidebar relabels with no route renames, one `notify` helper, one cron route, a server search with no embeddings, and new columns only where a PDF field has nothing to read from today. Bell and palette live in the shell, so neither runs in the call room. Anything the PDF shows that a lock forbids stays out and is listed below.

**Implementation skills**: `clerk`, `clerk-nextjs-patterns`, and `clerk-react-patterns` for the avatar menu, `/profile`, and Google status · `stream-react` for Raise hand (AC-70x) · none installed for `cmdk`; it is free and open source, and the project uses it only through one component.

## Design

### Empty states (AC-70f)

| Tab | Text | Action |
|---|---|---|
| Overview | Each card says what is missing | Schedule Meeting (Developer or higher), Add Member (Owner, Admin) |
| Meetings | No project meetings yet. | Schedule Meeting (Developer or higher) |
| Tasks | No tasks yet. Tasks come from reviewed proposals, or you can add one. | Add Task (Developer or higher) |
| Members | Only you are here so far. | Add Member (Owner, Admin) |
| GitHub | GitHub is not connected. | Connect GitHub (Owner); others read that the Owner connects it |
| Development Activity | Task, meeting, and GitHub events will show up here. | None |
| Decisions and Promises | Decisions and promises show up here once a project meeting is processed. | None |
| AI Assistant | The assistant answers from processed meetings. Process one first. Shown when the project has no meetings. | None |
| Settings | Always has the project details, so it needs no empty state. | None |

### What stays out of the PDF

| PDF item | Why it stays out |
|---|---|
| Development simulator, Contributors tab, My GitHub Contributions, By assignee bars, per developer done counts | Cut list in `AGENTS.md`, because they read as surveillance or put fake evidence next to real |
| Sprints; Commits sub tab, commit counts, and commit rows in Activity | Cut list in `AGENTS.md`: no raw commit ingestion beyond PR linked commits. PR linked commits do appear in the drawer, on click (AC-70q) |
| A global assistant that reads project data | Cut list in `AGENTS.md`. The sidebar link keeps the existing general chat, which reads no project data |
| Live captions and live transcript | Locked out of the core: paid on Stream, no Urdu |
| The PDF's colors | The locked Stitch tokens stay |
| Also create GitHub issues, Issues sub tab, linked issues | Needs Issues write, which is a post W9 stretch in [index.md](index.md) |
| PR Approve button | Needs Pull requests write, and the App is read only by design |
| Per project webhook health | `github_deliveries` has no repo column; last sync shows instead |
| Require owner approval as a toggle | W2 always requires approval on a link, so it is a fixed line |
| Meeting reminders | You chose none, which saves the email budget and a second cron |
| Dark theme, remember me, PR review status | Tokens are light only; Clerk owns session length; review state is not stored |
| Open as invitee | A prototype control with no meaning in the product |

### Notification content (AC-71a)

| Kind | Title | Body | Link |
|---|---|---|---|
| `task_assigned` | You were assigned `<KEY>` | task title | `/projects/<id>?tab=tasks&task=<taskId>` |
| `proposals_ready` | `<n>` task proposals to review | meeting title | `/projects/<id>?tab=tasks` |
| `join_request` | `<name>` asked to join `<project>` | Review it on the Members tab. | `/projects/<id>?tab=members` |
| `join_approved` | You joined `<project>` | Your role is `<role>`. | `/projects/<id>` |
| `task_completed_by_merge` | `<KEY>` completed by a merge | task title | `/projects/<id>?tab=tasks&task=<taskId>` |
| `task_reopened_by_revert` | `<KEY>` reopened by a revert | task title | `/projects/<id>?tab=tasks&task=<taskId>` |
| `kept_suggestion` | A merge may keep a promise | `<KEY>`: check it in Decisions and Promises. | `/projects/<id>?tab=promises` |
| `meeting_scheduled` | New meeting in `<project>` | meeting title and start time in PKT | `/projects/<id>?tab=meetings` |
| `task_due` | `<KEY>` is due today | task title | `/projects/<id>?tab=tasks&task=<taskId>` |
| `project_invitation` | You were invited to `<project>` | Your role would be `<role>`. | `/projects` |
| `member_role_changed` | Your role changed in `<project>` | Your role is `<role>`. | `/projects/<id>` |
| `member_joined` | `<name>` joined `<project>` | Their role is `<role>`. | `/projects/<id>?tab=members` |
| `pr_review_requested` | Your review was requested | `<repo full name>` #`<number>` | `/projects/<id>?tab=github` |

`NOTIFICATION_CATEGORIES` in `src/lib/notifications.ts`: Tasks is `task_assigned`, `task_due`, `task_completed_by_merge`, `task_reopened_by_revert`, `proposals_ready`. Meetings is `meeting_scheduled`. GitHub is `pr_review_requested`, `kept_suggestion`. Projects is `join_request`, `join_approved`, `project_invitation`, `member_role_changed`, `member_joined`.

### Where notifications are written

One helper `notify(supabase, { userIds, projectId, kind, title, body, link, dedupeKey, email? })` in `src/lib/notifications.ts`. It inserts with `upsert(..., { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select()`, which returns only new rows, then emails those rows unless `email` is false. It never throws. `projectId` is required, since every kind belongs to a project.

Callers run it after the main write succeeds. Routes wrap it in `after()`. Code already outside the request (`src/lib/github-rules.ts`, which runs in the webhook's `after()`, the Sync route, and the cron) awaits it directly, so `after()` is never nested.

| Kind | Caller |
|---|---|
| `task_assigned` | `POST /api/projects/[id]/tasks`, `PATCH /api/tasks/[id]`, `POST /api/proposals/[id]/review` on confirm |
| `proposals_ready` | `/api/ai/process`, proposal path |
| `join_request` | `POST /api/invitations/accept`, link kind |
| `join_approved` | `POST /api/projects/[id]/join-requests/[requestId]` on approve |
| `task_completed_by_merge`, `kept_suggestion` | `completeTasks` in `src/lib/github-rules.ts` |
| `task_reopened_by_revert` | `applyRevert` in `src/lib/github-rules.ts` |
| `meeting_scheduled` | `createScheduledMeetingRow` in `src/actions/meetings.ts`, project path |
| `task_due` | `/api/cron/daily` |
| `project_invitation` | `POST /api/projects/[id]/invitations`, email kind |
| `member_role_changed` | `PATCH /api/projects/[id]/members/[userId]` |
| `member_joined` | `POST /api/invitations/accept` email kind, `POST /api/invitations/mine/[id]` on accept, join request approve |
| `pr_review_requested` | `handleGitHubEvent` in `src/lib/github-rules.ts`, a separate branch before the `HANDLED_PR_ACTIONS` gate |

`pr_review_requested` never moves a task: `review_requested` stays out of `HANDLED_PR_ACTIONS`, and its branch returns after notifying. It needs no task link and no new App permission, since the App already receives `pull_request`. Confirm that payload's `requested_reviewer` shape at build.

`createScheduledMeetingRow` runs in a server action, so wrap `notify` in `after()` there too. It notifies only on an insert or a changed `started_at`, so editing a title sends nothing.

`kept_suggestion` needs no SQL change: after `apply_merge_completion`, `completeTasks` selects `ledger_links` where `evidence_task_link_id` is one of the task's links and `state = 'suggested'`, then notifies per link. The dedupe key stops repeats.

The rpc results hold only a status string, so `completeTasks` and `applyRevert` read the assignee, title, number, and project through the task id. `create_project_task` starts a task at version 1. PATCH takes the old assignee from the row it already read and uses `ifVersion + 1` as the key's version, since `update_task` returns only the task id and a later read could see a newer version.

In `/api/ai/process`, hoist one `processedAt` const, used by both the `meeting_insights` insert and the dedupe key. `<n>` is the length of the `rows` from `buildProposalRows`. `POST /api/invitations/accept` captures the request id from the `request_project_join` result, which it discards today. The approve route reads `user_id` and `role` from the `decide_join_request` result.

`src/lib/email.ts` exports `escapeHtml` and gains `sendWorkspaceEmail(to, subject, html)`, which uses `RESEND_WORKSPACE_FROM` with no fallback and never throws, like `sendProjectInviteEmail`. Event and digest emails go through it.

### Palette search

`GET /api/projects/search?q=` trims `q`, returns empty groups under 2 characters, cuts it to 100, and escapes `%`, `_`, and `\` before `ilike`. Title match on projects, tasks, and meetings, and statement match on decisions, 5 per group, limited to your active projects plus personal meetings where `user_id` is you and `project_id` is null. A `KEY-123` query (`^[A-Za-z]{2,5}-\d+$`) also matches the task exactly, through `task_prefix` and `number`. Each row carries its `href`. It never uses embeddings.

### Tokens (AC-79)

Contrast checked: each text and background pair is 5.1:1 or better.

| Token | Value |
|---|---|
| `success` | `#1B6D3C` |
| `on-success` | `#FFFFFF` |
| `success-container` | `#C9F2D5` |
| `on-success-container` | `#0B3D20` |
| `warning` | `#7A5900` |
| `on-warning` | `#FFFFFF` |
| `warning-container` | `#FFE3A1` |
| `on-warning-container` | `#3F2E00` |

### API surface

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /api/notifications | GET | cursor (`createdAt\|id`), unread?, category? | items, unreadCount, categoryCounts, nextCursor | signed in | 401, 422 bad cursor |
| /api/notifications/read | POST | ids or all, unread? | ok | signed in, own rows | 401, 422 |
| /api/my-counts | GET | | openTasks, upcomingMeetings, unread, prReviews | signed in, active projects | 401 |
| /api/settings/notifications | GET | | emailNotifications, digestEmails | signed in | 401 |
| /api/settings/notifications | POST | emailNotifications?, digestEmails? | ok | signed in | 401, 422 |
| /api/settings/github | GET | | connected, login, authorizeUrl | signed in | 401 |
| /api/settings/github | DELETE | | ok | signed in, own row | 401 |
| /api/my-tasks | GET | | today, tasks, truncated | signed in, active projects | 401 |
| /api/projects/search | GET | q | projects, tasks, meetings, decisions, each with href | signed in | 401 |
| /api/projects (extended) | POST | adds description?, projectType?, icon?, color? | project | signed in | 422 |
| /api/projects (extended) | GET | | adds description, status, type, icon, color, owner, repo, task counts, next meeting, updated, avatars | signed in | 401 |
| /api/projects/[id] (extended) | GET | | adds description, status, type, icon, color, owner, task totals by status, openTaskCount, overdueTaskCount, upcomingMeetingCount, decisionCount, linkedPrCount, and `github { connected, repos, lastSyncedAt }` | member | 404 |
| /api/projects/[id] (extended) | PATCH | name?, description?, status?, projectType?, icon?, color? | project | owner | 403, 404, 422 |
| /api/projects/[id]/members (extended) | GET | | members add imageUrl, githubLogin, openTaskCount | member | 404 |
| /api/projects/[id]/github/summary | GET | | repos, lastSyncedAt, counts, pulls | developer+ | 403 viewer, 404 |
| /api/projects/[id]/tasks (extended) | GET | adds priority? | tasks add priority, commentCount, meeting title, PR refs (the last two follow the Viewer rule) | member | 422 |
| /api/projects/[id]/tasks (extended) | POST | adds priority? | task | developer+ | 422 |
| /api/tasks/[id] (extended) | GET | | adds priority, comments, commentsTruncated (not for Viewer) | member | 404 |
| /api/tasks/[id] (extended) | PATCH | adds priority? | task | as before | 409, 403, 422 |
| /api/tasks/[id]/comments | POST | body | comment | developer+ | 403, 404, 422 |
| /api/tasks/[id]/comments/[commentId] | DELETE | | ok | author, or owner or admin | 403, 404 |
| /api/tasks/[id]/commits | GET | | commits per PR | developer+ | 403 viewer, 404, 502 GitHub failed |
| /api/proposals/[id]/review (extended) | POST | adds priority? | as before | owner, admin | as before, 422 |
| /api/projects/[id]/invitations/[invitationId]/resend | POST | | link (once), emailed | owner, admin | 404, 410, 422 link kind |
| /api/invitations/preview (extended) | GET | token | adds inviter, description, icon, color, counts, createdAt, invitedAt, repoName?, team?, invitationId? | signed in | 410, 429 |
| /api/invitations/mine | GET | | active email invites for your verified email, never a token | signed in | 401 |
| /api/invitations/mine/[id] | POST | decision | status, projectId | signed in, matching email | 404, 410, 422 |
| /api/projects/[id]/ledger (extended) | GET | adds meetingId?, q?, tag? | items add tag, participants | member (redacted for viewer) | 422 |
| /api/projects/[id]/activity (extended) | GET | adds category?, actorId? | adds categoryCounts | member | 422 |
| /api/meetings (extended) | GET | projectId? | adds description, scheduledEndAt, meetingType, organizerName, invitedUserIds, and on a project list summaryExcerpt, decisionCount, actionItemCount, proposalCount (Viewer counts confirmed items only, no proposalCount) | signed in | 404 |
| /api/meetings/[id] (extended) | GET | | adds description, scheduledEndAt, meetingType, organizerName, invitedUserIds, transcriptText (not for Viewer) | read | 404 |
| /api/cron/daily | GET | Bearer header | counts, failedJobs | `CRON_SECRET` | 401 |

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Email toggle on the server | boolean | `user_settings.email_notifications`, default true |
| Email address | primary email | Clerk `getUserList` on the server at send time, in batches; no address is logged and skipped |
| Today | date | Asia/Karachi day, the helper at `src/lib/project-select.ts:206`, on the server |
| Event budget day | UTC day | `emailed_at` and `invite.emailed` rows since UTC midnight, counted once per batch then tracked in memory |
| Digest day and budget | date | `user_settings.digest_sent_on`, a PKT date; at 03:00 UTC the PKT and UTC days match |
| Digest content | tasks, count | `tasks` due on or before today, not completed; unread `notifications` from 24 hours |
| Task key | text | `projects.task_prefix` + `-` + `tasks.number` |
| Merge dedupe sha | text | `task_links.merge_sha` on the task's link where `pr_url = tasks.completion_evidence` |
| Revert dedupe number | number | `pr.number` of the revert PR in `applyRevert` |
| Assignee version | number | `tasks.version` after the write |
| Join request name | text | `caller.displayName`, already in `POST /api/invitations/accept` |
| Project name | text | `projects.name` |
| GitHub connected | boolean | at least one `github_repos` row linked to the project, returned to every member |
| GitHub repos in the header | names | `github_repos.full_name`. A Viewer gets public repos only (`private = false`); a private one shows as "Repository connected" |
| Last synced | timestamp | the later of the latest `audit_log` Sync row for the project and `max(task_links.last_synced_at)` |
| Task prefix default | text | client: first letters of up to 5 name words in capitals, at least 2, still checked by the route |
| Project task counts | numbers | `project_task_counts(p_projects, p_today)`, with `p_today` the PKT day |
| Member open tasks | number | one query of the project's not completed tasks by `assignee_id`, counted in code |
| Project Memory counts | numbers | meetings with `meeting_insights`, `ledger_items` where `kind = 'decision'`, tasks, `task_links` |
| PR author | text | `task_links.pr_author_login`, written from `user.login` in `snapshotFromWebhook` and `snapshotFromRest`; older rows fill in on the next Sync, and null shows nothing |
| Review PRs count | number | your unread `pr_review_requested` rows |
| GitHub account | login, id | `GET /user` with the user token, stored in `user_settings`; the token ends there |
| PR reviewer match | user id | `requested_reviewer.id` against `user_settings.github_user_id`, not the login, since a login can change |
| Tag | text | `meeting_insights.category` of the item's meeting |
| Decision participants | user ids | `meeting_participants` for the item's meeting, first 5 |
| Invited members | user ids | `meetings.invited_user_ids`, checked against active members on write |
| Meeting organiser | name | `meetings.user_id` through a Clerk batch |
| Meeting duration | minutes | `ended_at` minus `started_at` when ended; `scheduled_end_at` minus `started_at` when upcoming; otherwise hidden |
| Task due today | rows | `tasks` with `due_date` = the PKT day, not completed, `assignee_id` set |
| Digest candidates | user ids | assignees of the digest's tasks plus users with unread rows, merged in code, then matched to `user_settings` |
| Cron Sync projects | project ids | `task_links` in state open or draft, joined with `tasks!inner(project_id)`, ordered by `last_synced_at` nulls first, limit 200, first 5 distinct projects |
| Admins to notify | user ids | active `project_members` with role owner or admin |
| Next meeting | row | earliest `status = 'scheduled'` row with `started_at` from now on, from `GET /api/meetings` (a missed one stays under Upcoming, never as Next) |
| Overview counts | numbers | `GET /api/projects/[id]`, count queries on `tasks` |
| Review counts | numbers | `listProposals` length, and `reviewCount` from `GET /api/projects/[id]/ledger` when `canReview` |
| Project chip name | text | `GET /api/projects`, matched on `projectId` |
| Cron auth | secret | `CRON_SECRET` from Vercel |

Constants in `src/lib/notifications.ts`: `EVENT_EMAIL_DAILY_CAP = 60`, `DIGEST_DAILY_CAP = 20`, `BELL_REFETCH_MS = 60_000`, `CRON_SYNC_PROJECTS = 5`, `CRON_RUN_MS = 50_000`, `TASK_DUE_CAP = 200`. Project icons are a fixed lucide set: `folder`, `code`, `smartphone`, `brain`, `server`, `globe`, `rocket`, `database`. The signature becomes `syncProject(supabase, projectId, opts?: { now?, maxMs? })`, with `maxMs` defaulting to `SYNC_MAX_MS`, and `outOfBudget` reads the run's limit. Notify time counts inside this budget, since `notify` is awaited during Sync.

### Key invariants

- A notification never blocks or fails the action that caused it.
- One event gives one row per person and at most one email, because only new rows email.
- Every loading state on the new pages and tabs uses `useLoadingTimeout` and `LoadError`. A failed bell refetch stays quiet (AC-73).
- Proposals never read as created tasks until confirmed.
- Priority set after a create never bumps `version` or writes an event, since nobody has seen the task yet. Every later change goes through `update_task`.
- A proposal priority comes from a person, never from the AI.
- Invited members are a display and notice list. Who may join stays with the call type and role rules.
- The GitHub account link and a repo link are separate. Connecting an account grants nothing.
- Commit reads are never stored.

### Security model

- All notification routes use the Clerk user id and only touch that user's rows. RLS stays on with no policies, as in the W8 SQL block.
- The cron compares the token in constant time. Stored links are app paths only.
- Palette, My Tasks, and Overview filter by active membership inside the query.
- Viewers see no Prepare button, no proposals, and only role allowed data, through the existing routes.
- Viewers get no comments, comment counts, PR refs, commits, transcript text, or GitHub tab. Private repo names stay hidden in the header and on My Projects. Comments are free text and could repeat a quote, which is why they are hidden.
- Comments render as plain text only, and no route accepts a raw project color or a free icon name.
- Search on the ledger and in the palette matches `statement` only, so hidden quotes cannot be probed.
- `/api/invitations/mine` matches only a verified primary email and never returns a token. Team names and private repo names on the invite page follow AC-70s.
- Install state and account state use separate derived keys and carry the user id, which the callback compares with the signed in user. A login is never trusted alone.
- `project_invitation` runs a Clerk email lookup but changes nothing in the response, so an invite cannot be used to learn who has an account.
- Resend rotates the token, so only the newest link works.

### Critical test scenarios

- Happy path: assigning a task to someone writes one notification and, with the sender set, one email; the bell count goes up; the row opens the drawer, verifies **AC-70c**, **AC-71**, **AC-72**, **AC-74**.
- Self assign: no row, verifies **AC-71**.
- Dedupe: the same event twice writes one row and one email, and two Admins each get their own row for one event, verifies **AC-71**, **AC-74**.
- Kept suggestion: a merge on a task with a linked ledger item notifies Owner and Admins; Sync repeating it adds nothing, verifies **AC-71**.
- No leak: a notification row holds no quote or PR title; a link without a leading `/` is rejected, verifies **AC-71a**.
- Removed member: their old rows and unread count vanish, and the palette and My Tasks return nothing from that project, verifies **AC-72**, **AC-77**, **AC-78**.
- Budget: with 60 event emails sent today, the 61st event writes the notification and sends no email; a 21st digest is not sent, verifies **AC-74**, **AC-76a**.
- Toggle: email off on the server means no event email and no digest email; the Settings toggle shows the server value, verifies **AC-74**, **AC-75**, **AC-76a**.
- Cron: no header 401, unset secret 401; with it, old deliveries go and counts return; a second run the same day sends no second digest; a failed job does not stop the next one; the time budget stops new projects, verifies **AC-76**, **AC-76a**.
- Unchanged assignee: a PATCH to the title or status writes no notification, verifies **AC-71**.
- Shared budget: with 60 event emails sent today, an invite email is not sent and the copy link still works, verifies **AC-74**.
- First digest: a user with no `user_settings` row gets one digest, and the rerun sends none, verifies **AC-76a**.
- Tabs: each role sees its tab set in the PDF's order; `?tab=board` and `?tab=proposals` land on Tasks; `?tab=github` lands on GitHub and its toast fires; a Developer on `?tab=settings` and a Viewer on `?tab=github` get Overview, verifies **AC-70**, **AC-70a**.
- Fresh project: every tab shows its empty state, and a Viewer sees no action, verifies **AC-70f**.
- Tasks: confirming a proposal shows the new task without a reload; a bad `?task=` toasts and clears, verifies **AC-70c**.
- Overview: no `/api/prep` call on load, one failed card leaves the others, verifies **AC-70b**.
- Palette: `%` matches a literal percent; `ABC-12` finds the task; an exact key from another project finds nothing; a word only in a quote finds no decision, verifies **AC-78**, **AC-78b**.
- Header: a Viewer sees no private repo name, and every member sees the right buttons; a failed count blanks only itself, verifies **AC-70g**.
- Create: a project with only a name gets the defaults; a raw color or unknown icon is 422; Connect GitHub next lands on the tab, verifies **AC-70h**.
- GitHub tab: a Viewer gets 403; a Developer sees no Sync or Disconnect; counts cover linked PRs only, verifies **AC-70i**.
- Members and invites: three addresses with one bad one reports each result; Resend kills the old link; a link tab cannot pick Admin, verifies **AC-70j**, **AC-70k**.
- Filters: Decisions by tag and by meeting, Activity by category and by person, each filtered on the server, and a Viewer's probe for quote text finds nothing, verifies **AC-70l**, **AC-70m**.
- Priority: a bad value is 422; a Developer changes it on their own task and gets 403 on someone else's; an `edited` event records it, verifies **AC-70o**.
- Board and List: dragging is off while a filter is on; a column `+` creates and moves; a failed move still reports the created task, verifies **AC-70p**.
- Comments: Developer posts, Viewer gets 403 and no comments in GET; only the author or an Owner or Admin deletes; the event holds no text, verifies **AC-70r**.
- Commits: a click reads GitHub once and writes nothing; a GitHub failure blanks only that section; a Viewer gets 403, verifies **AC-70q**.
- Invite page: an unrelated signed in person on a link invite sees no team names or private repo name; declined email invite answers 410 on its token; accept through `/mine` fails for another email, verifies **AC-70s**, **AC-70t**.
- Scheduling: an invited id who left the project is rejected; a Viewer not on the list can still join; a title edit sends no notice, and a new start time sends one, verifies **AC-70u**, **AC-71b**.
- Bulk confirm: one failing row among three reports only that row, and a row with no verified quote is never confirmed by the button, verifies **AC-70w**.
- New kinds: `review_requested` moves no task; a reviewer with no linked account or a Viewer gets nothing; a second delivery adds nothing; `task_due` reruns add nothing and send no email, verifies **AC-71b**, **AC-71c**.
- Notifications page: category counts match rows; a row toggles unread; another user's id is untouched; `project_invitation` shows before you are a member, verifies **AC-72**, **AC-72a**.
- Digest toggle: `digest_emails` off stops the digest and leaves event email alone, verifies **AC-75**, **AC-76a**.
- My Tasks: tab counts match, sort works, more than 200 open shows the line, a task in a project you left is gone, verifies **AC-77**.
- Sidebar and menu: collapse survives a reload and works with storage blocked; counts match; `/profile` needs sign in; My Dashboard has no activity feed, verifies **AC-77a**, **AC-77b**, **AC-77e**.
- My Projects: one query per concern, not per project; status filter and toggle work; a Viewer's card hides a private repo, verifies **AC-77d**.
- Connected account: an install state on the account path, or the reverse, is refused; another person's state is refused; the same GitHub id on a second user returns `already_linked`; no token is stored; disconnect leaves installations alone, verifies **AC-77g**.
- Raise hand: a Developer on a `project` call raises a hand and others see it, verifies **AC-70x**.

## Build plan

The project builds by extending what works, so each slice leaves the app working. W7 comes first. Following the PDF roughly doubled this step, so these 21 slices are a lot for one sitting. I'd recommend you run them across several `/develop` sessions, stopping after slices 5, 12, and 17.

1. Add `RESEND_WORKSPACE_FROM` and `CRON_SECRET` to `.env.example`, run the W8 SQL block, write `notify` with tests, satisfies **AC-71**, **AC-71a**, **AC-71c**.
2. Wire `notify` into the existing routes and `src/lib/github-rules.ts`, satisfies **AC-71**.
3. Notification routes with categories and the unread toggle, `GET /api/my-counts`, satisfies **AC-72**.
4. Event email gate, the settings route with `digestEmails`, and the Settings toggle, satisfies **AC-74**, **AC-75**.
5. Daily cron route with `task_due`, `maxMs` on `syncProject`, `vercel.json`, satisfies **AC-76**, **AC-76a**, part of **AC-71b**.
6. Before any UI: check the layout against `context/designs/NeuraMeet-UI-Overview.pdf`. Then add the tokens and use them, satisfies **AC-79**, **AC-79a**.
7. Sidebar with counts and collapse, header with breadcrumbs, Help, and avatar menu, `/profile`, middleware, bell, `/notifications`, satisfies **AC-72a**, **AC-73**, **AC-77a**, **AC-77e**.
8. Settings page tabs, then the account state, callback branch, and `/api/settings/github`, then `pr_review_requested`, satisfies **AC-77f**, **AC-77g**, part of **AC-71b**.
9. Project fields in the routes, `project_task_counts`, New Project with its success screen, My Projects, satisfies **AC-70h**, **AC-77d**.
10. Tab keys and aliases, project header, Settings tab, Overview, then every empty state, satisfies **AC-70**, **AC-70a**, **AC-70b**, **AC-70e**, **AC-70f**, **AC-70g**.
11. Priority in the routes and `update_task`, then Tasks with Review, filters, Board and List, satisfies **AC-70c**, **AC-70o**, **AC-70p**.
12. Comments, the drawer, and the commits route, satisfies **AC-70q**, **AC-70r**.
13. Members table and Add Members with Resend, plus `member_role_changed` and `member_joined`, satisfies **AC-70j**, **AC-70k**, part of **AC-71b**.
14. Invite page, `/api/invitations/mine`, the banner, and `project_invitation`, satisfies **AC-70s**, **AC-70t**, part of **AC-71b**.
15. Schedule dialog fields, `meeting_scheduled`, and the Meetings tab, satisfies **AC-70d**, **AC-70u**, part of **AC-71b**.
16. Meeting Details header, Transcript tab, and proposals on Action Items, satisfies **AC-70v**, **AC-70w**.
17. GitHub tab, its summary route, and `pr_author_login`, satisfies **AC-70i**.
18. Decisions and Activity filters, then the AI Assistant tab, satisfies **AC-70l**, **AC-70m**, **AC-70n**.
19. `GET /api/my-tasks`, `/my-tasks`, My Dashboard, and My Meetings, satisfies **AC-77**, **AC-77b**, **AC-77c**.
20. Install `cmdk`, then the palette with Decisions, its search route, and `q` on `/search`, then Raise hand and the auth page layouts, satisfies **AC-78**, **AC-78a**, **AC-78b**, **AC-70x**, **AC-70y**.
21. Update `tests/w-test` where labels or tab locations moved, update `context/ui-registry.md` and `context/progress-tracker.md`, run `/imprint`, satisfies **AC-70** to **AC-79**.

## Consequences

**Positive**:
- Old bookmarks and the GitHub callback keep working, as no route is renamed.
- In app notifications work with no email setup at all.

**Negative / tradeoffs**:
- A failed digest send loses that day's digest. That is the price of never sending twice.
- A crash after a merge completes the task but before `notify` loses that completion notice, because a redelivery returns `already_completed`. The task and its Proof Chain stay correct.
- Two event batches at once can overshoot the budget by a few emails. The 60 and 20 budgets sit well under Resend's 100 a day.
- Prepare draws on your own meetings, not the whole project's, because `/api/prep` is user scoped.
- Sync moves off Tasks to the GitHub tab and the More menu. This changes where W5 placed it, in your favor, since it now sits with GitHub.
- GitHub tab numbers cover only PRs linked to tasks, not the whole repo as the PDF shows, because W5 stores only those. They are labelled so.
- "Search" in Development Activity only filters loaded rows, as the view has no text to search.
- A second request to review the same PR writes no second notice, since the dedupe key has no date.
- A reader who has not connected a GitHub account gets no review notices.
- Meeting Details keeps more tabs than the PDF, because Minutes, Engagement, and the Ledger are shipped features with no other home.
- The scope is about twice the earlier W8, so it takes longer before W9 and Deploy.
- Notification rows are never purged. They are small, and the free database has room.

**Neutral**:
- `user_settings` is the email toggle for event and digest email only. The summary email still follows the browser's copy, as it does today.
- Existing rows take the new column defaults: Active, type Other, Medium priority, no description. No data migration beyond that.
- The `/ai-chat` page gets a new label and stays the same chat. "AI Assistant" in the sidebar reads no project data, and project questions go through each project's tab.

## Follow-up

- [x] Add the `NeuraMeet UI Overview` PDF to `context/designs/` before build step 6. It is at `context/designs/NeuraMeet-UI-Overview.pdf` (27 pages, added 2026-11-07).
- [ ] Apply the AGENTS.md API Contracts changes before the build (`/sync`): the lines added to the contract list in [index.md](index.md) for W8.
- [ ] Set `RESEND_WORKSPACE_FROM` and `CRON_SECRET` in Vercel at Deploy.
- [ ] Decide later whether Prepare should search the whole project through W7's project filter.
- [ ] Verify at build against GitHub: listing a PR's commits and reading `GET /user` work with today's App permissions, and the `pull_request` `review_requested` payload carries `requested_reviewer.id`. The official pages I fetched did not state these. If a read needs more than Pull requests read, hide "Show commits" rather than widen the App.
- [ ] Set your GitHub App's user authorization callback to include `/api/github/callback` on both dev and production Apps. It already does for install, so this should need no change.
- [ ] The lock on PDF items is yours to overrule. If you want any row under "What stays out of the PDF" back, tell me which one and I'll update this spec and the matching `AGENTS.md` line through `/sync`.

## Rationale (short)

In app notifications always work; email is an extra that only turns on with a real sender and under the free cap. One daily cron fits Vercel Hobby and does three jobs. Polling every minute is cheap at this scale and needs no realtime service.

Options set aside: a Clerk or third party notification feed (a new tool for what one table does), route renames such as `/my-meetings` (breaks bookmarks for a label), a separate Proposals tab (the PDF's tab list has none, and review belongs next to the board), embeddings in the palette (a billed style call per keystroke, against the free tier limits), a chart library for one donut (SVG is enough), storing GitHub user tokens (W5 forbids it), and asking the AI for a priority (the review gate keeps people deciding).

Following the PDF over the earlier "leave as is" list was your call on 2026-11-07. Your locked decisions from 2026-11-02 and the zero cost rule still bound it, so only rows that break those stay out.

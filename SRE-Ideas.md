# SRE and monitoring ideas

Follow-ups for the admin dashboard (see `core/monitor.py` and `static/js/admin.js`).

## To do

- [ ] **Uptime ping.** Set up a free monitor (e.g. UptimeRobot) to hit the site every 5 minutes. It alerts when the site is down and keeps Render's free tier from sleeping, so there are fewer cold starts.
- [ ] **Search keywords.** Connect Google Search Console and Bing Webmaster Tools to plannedout.in. Search engines don't send search terms to the site, so this is the only way to see which searches bring people in.
- [ ] **Weekly summary email.** Send admins the key numbers each week: new users, active users, errors, database size.
- [ ] **Contact form topics.** Count contact-form submissions by topic to spot common questions and problems.
- [ ] **Feedback on what-ifs.** Show a small "Was this useful?" prompt after someone uses a what-if, and count the answers.

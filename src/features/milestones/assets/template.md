# 🏆 Full Calendar - Monthly Milestones & Usage Report
*This report summarizes your activity and achievements for the month of **{{MONTH}}**.*

> [!info] 📋 Options for this temporary report:
> - 💾 [Save permanently to Vault root](obsidian://full-calendar-milestones?action=keep)
> - 🗑️ [Delete and Close report](obsidian://full-calendar-milestones?action=delete)

---

## 📊 Usage Dashboard

### ⏱️ Previous Month ({{MONTH}}) vs. ♾️ Lifetime Stats

| Previous Month Operations | Previous Month Created | Best Action Streak | Timezones Handled |
| :---: | :---: | :---: | :---: |
| **{{PREV_MONTH_OPS}}** | **{{PREV_MONTH_CREATED}}** | **{{LIFETIME_STREAK}} days** | **{{LIFETIME_TZ}}** |

---

### 📂 Your Calendars & Activity

{{CALENDARS_TABLE}}

---

### 🧠 Feature Adoption Metrics

> [!info] Feature Highlights
> - **Natural Language Processing (NLP)**: You've created **{{NLP_CREATED}} events** using natural language!
> - **Recurring Events**: You've scheduled **{{RECURRING_CREATED}} recurring series**.
> - **Workspaces**: You have **{{WORKSPACES_COUNT}} workspaces** set up to organize your layouts.
> - **Planning Habits**:
>   - 🦉 **Night Owl**: {{NIGHT_OWL_OPS}} operations between 10 PM and 4 AM.
>   - 🌅 **Early Bird**: {{EARLY_BIRD_OPS}} operations between 5 AM and 8 AM.
>   - 🏄 **Weekend Warrior**: {{WEEKEND_OPS}} operations on Saturdays and Sundays.

---

## 💌 Developer Feedback

Hello! We are the developers of Full Calendar. Building and maintaining this plugin is a labor of love. To make Full Calendar even better, it is incredibly valuable for us to understand which features are most heavily used. This helps us direct our development energy (e.g., stabilizing CalDAV sync, enhancing NLP, or optimizing local note loading) to where it benefits you most.

### How it works:
1. All statistics collected here are **100% anonymous, aggregate counts**. 
2. No vault names, file paths, event titles, or personal details are ever collected.
3. Because Obsidian strictly protects your privacy, **no data is sent automatically**. You have full control!
4. If you want to support development, follow the single-step instruction below to submit this audited JSON payload manually.

---

## 🚀 Submit Feedback

**Instruction**: To securely and anonymously share your usage stats with us, simply copy the `curl` command inside the block below, paste it into your computer's terminal (Command Prompt/PowerShell on Windows, or Terminal on macOS/Linux), and press **Enter**.

```bash
curl -X POST https://fcr-cdn.plugin-fcr.workers.dev/telemetry \
  -H "Content-Type: application/json" \
  -d '{{JSON_PAYLOAD}}'
```

---

### 💖 Love Full Calendar?
If this plugin helps organize your life and save you time, please consider supporting its ongoing development. Every contribution keeps the project active and independent!
*   **☕ Sponsor on Ko-fi**: [ko-fi.com/youfoundjk](https://ko-fi.com/youfoundjk)
*   **💖 Sponsor on GitHub**: [github.com/sponsors/YouFoundJK](https://github.com/sponsors/YouFoundJK)

Thank you so much for being part of our journey! 🙏

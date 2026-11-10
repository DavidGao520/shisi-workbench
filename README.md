# 🥢 Shisi Workbench · 食肆工作台

![A green house menu and a steaming rice bowl. From a game card to your dinner table: 72 recipes, local-first, WorkBuddy.](creative-workbench/docs/readme/kitchen-menu.svg)

**[🍳 Open the kitchen](https://f80db58982994e7591c0623b311c603b.app.workbuddy.link/) · [🎬 Watch the cola chicken wings demo](https://f80db58982994e7591c0623b311c603b.app.workbuddy.link/demo.mp4) · [🛠️ Run it locally](#run-it-locally)**

In *Cuisine of China* (中华食肆), you collect dishes by playing a restaurant card game. In **Shisi Workbench**, you collect them by cooking dinner. Tell the kitchen what's in your fridge, pick a dish you can make, then save a photo and a few words about how it turned out.

The kitchen speaks Chinese. The labels below match what you'll see on screen.

## 🍽️ A taste of the menu

<p align="center">
  <img src="creative-workbench/assets/baiwei/dishes/spicy_chicken.webp" width="24%" alt="Laziji: golden chicken bites with dried red chilies"/>
  <img src="creative-workbench/public/art/cards/cooked_rice.webp" width="16%" alt="A bowl of steamed white rice"/>
  <img src="creative-workbench/assets/baiwei/dishes/green_pepper_eggplant.webp" width="24%" alt="Eggplant and green peppers glistening with sauce"/>
</p>
<p align="center"><em>Laziji 🌶️ &nbsp; · &nbsp; Steamed rice 🍚 &nbsp; · &nbsp; Eggplant with green peppers 🍆</em></p>

**Try this first:** open the sample kitchen (choose **先逛逛样例厨房** if you're in your personal kitchen). Visit **百味图**, find **青椒茄子** (eggplant with green peppers), and choose **看实拍与食忆** to see the cook's photo and note: *“This is the best vegetable dish I've ever made.”* That's one of six real cooking memories in the sample. You can explore without changing your own pantry.

## 🧑‍🍳 One dinner, four stops

| Where to go | What you can do |
| --- | --- |
| 🧺 **My Kitchen · 我的厨房** | Add ingredients by hand, voice or photo. Review what was recognized before it enters your pantry. Even oil and salt only count if you say you have them. |
| 🍅 **Today's Meal · 今日一餐** | Get up to three suggestions from your confirmed, unexpired ingredients, or search for a dish by name. No need to weigh the entire fridge first. |
| 🔥 **Cooking Mode · 做菜模式** | Follow a recipe one step at a time, with heat settings, timers and cues for when to move on. Pause and come back; pantry deductions happen when you finish the meal. |
| 📖 **Flavor Album · 百味图** | Rate the meal and, if you like, add a photo or note. Cook the same dish again and it gets another entry, so you can see what changed. |

📚 **Inside the cookbook:** 70 dishes from the original game, plus two kitchen additions: laziji and eggplant with green peppers. All 72 have built-in home recipes. The game supplies the illustrations and stories for its dishes; the real cooking instructions have [their own sources](creative-workbench/docs/CHINESE-RECIPE-SOURCES.md).

<a name="run-it-locally"></a>
## 🛠️ Run it locally

**From a source checkout:** use Node.js **22.13 or newer** and npm.

```sh
git clone https://github.com/DavidGao520/shisi-workbench.git
cd shisi-workbench/creative-workbench
npm ci
npm run dev -- --port 5177
```

Open [the local preview](http://localhost:5177/) (or the address printed in your terminal). Select **先逛逛样例厨房** to start with a stocked sample instead of an empty fridge. Stop the preview with **Ctrl+C**.

**Want the offline edition?** From the same folder, run `npm run build:html`, then open `release/中华食肆.html`. Manual entry, built-in recipes, timers and the album work without a model or API key. Opening the HTML alone does **not** connect a microphone or a WorkBuddy chat.

**Already have the judge ZIP?** You don't need Git or an npm install. Extract the *whole* package, install [WorkBuddy Desktop](https://www.workbuddy.cn/work/) and [Node.js](https://nodejs.org/en/download), then open the extracted folder as your WorkBuddy workspace. The [four-step launch card](creative-workbench/docs/JUDGE-START.txt) includes the exact prompt; the [walkthrough and troubleshooting guide](creative-workbench/docs/JUDGE-GUIDE.md) covers Windows and macOS.

## 🧠 Where AI helps (and where you decide)

- **📷 Ingredient photos:** in the WorkBuddy edition, prepare a photo request in the kitchen and send the image in your own WorkBuddy chat. The [included skill](creative-workbench/skills/zhonghua-shisi/SKILL.md) returns suggested ingredients. *You* confirm them. The hosted site's separate photo service requires [server configuration](creative-workbench/docs/CLOUD-PHOTO.md).
- **🎙️ Voice:** when the [cloud voice service](creative-workbench/docs/CLOUD-VOICE.md) is configured and reachable, Tencent Cloud transcribes your recording. If it isn't available, type the ingredients instead.
- **📝 A different take:** like a dish but want another way to cook it? In the connected WorkBuddy edition you can request an alternative set of steps. The built-in recipe is ready either way; you don't have to wait for AI to start dinner.
- **🔒 Your kitchen stays yours:** pantry entries, ratings and finished-meal photos stay in that browser's local storage database (IndexedDB). Sample and personal kitchens are separate; records don't sync across devices. A blank expiry date on a new batch gets a seven-day reminder, not a food-safety guarantee.

---

Made from the dishes, illustrations and stories of *Cuisine of China*, created by **David Gao and Jacky**. For credits and the distinction between game artwork, new illustrations and real cooking photos, see the [asset notes](creative-workbench/docs/ASSET-SOURCES.md). For more on running and building the workbench, see the [Chinese project guide](creative-workbench/README.md).

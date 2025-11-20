# 15 Category-Based Recommendation System

## Overview
The recommendation engine now supports 15 independent recommendation categories. Each category filters and ranks songs based on a specific dimension of your listening behavior.

## Category Details

### 1. Genre 🎼
**Dataset Column:** `Genre`

**How it works:**
- Analyzes your top genres by listening frequency, ratings, and completion rates
- Scores songs based on how well they match your preferred genres
- Top 5 genres are weighted by: 50% frequency + 30% rating + 20% completion

**What gets ranked first:**
- Songs in genres you listen to most frequently
- Songs in genres you rate highly
- Songs in genres you complete most often

**UI Text:** "Matches your [Genre] preferences"

---

### 2. Sub-Genre 🎹
**Dataset Column:** `Sub_Genre` (falls back to `Genre`)

**How it works:**
- Analyzes sub-genre preferences (e.g., "Pop Rock", "Indie Pop")
- Scores based on sub-genre match: 60% frequency + 40% rating

**What gets ranked first:**
- Songs matching your most-listened sub-genres
- Songs in sub-genres you rate highly

**UI Text:** "Matches your [Sub-Genre] sub-genre preference"

---

### 3. Artist 👤
**Dataset Column:** `Artist_Name`

**How it works:**
- Uses pre-calculated artist weights from pattern analysis
- Scores songs from artists you've listened to frequently
- Boosts songs from top 10 preferred artists by 20%

**What gets ranked first:**
- Songs from your most-listened artists
- Songs from artists you rate highly
- Songs from artists you complete most often

**UI Text:** "From [Artist], one of your preferred artists"

---

### 4. Song Title 🎵
**Dataset Column:** `Song_Title`

**How it works:**
- Finds similar songs by analyzing title word similarity
- Compares common words between your listened songs and recommendations
- Boosts songs from same artist by 30%

**What gets ranked first:**
- Songs with similar titles to ones you've listened to
- Songs from same artist as similar titles
- Songs sharing common meaningful words (>2 characters)

**UI Text:** "Similar to songs you've listened to"

---

### 5. Mood 😊
**Dataset Column:** `Mood`

**How it works:**
- Analyzes mood patterns (Happy, Sad, Energetic, etc.)
- Scores songs matching your preferred moods
- Weight: 50% frequency + 30% rating + 20% completion

**What gets ranked first:**
- Songs matching moods you listen to most
- Songs matching moods you rate highly
- Songs matching moods you complete most

**UI Text:** "Matches your [Mood] preferences"

---

### 6. Activity 🏃
**Dataset Column:** `Activity`

**How it works:**
- Analyzes activity-based listening patterns
- Scores songs matching activities you listen during
- Weight: 60% frequency + 40% rating

**What gets ranked first:**
- Songs matching your most common listening activities
- Songs you listen to during activities you rate highly

**UI Text:** "Perfect for your [Activity] sessions"

---

### 7. Time of Day 🕐
**Dataset Column:** `Hour_of_Day`

**How it works:**
- Uses current time of day (or provided context)
- Matches songs to your time-based patterns (morning/afternoon/evening/night)
- Scores based on genre preferences for that time slot
- Weight: 50% completion + 30% rating + 20% like ratio

**What gets ranked first:**
- Songs matching genres you listen to at current time
- Songs matching your time-based listening patterns

**UI Text:** "Matches your [Time Slot] listening patterns"

---

### 8. Day of Week 📅
**Dataset Column:** `Day_of_Week`

**How it works:**
- Analyzes listening patterns by day (Monday, Tuesday, etc.)
- Scores songs matching your day-specific preferences
- Weight: 70% frequency + 30% rating

**What gets ranked first:**
- Songs matching genres you listen to on specific days
- Songs matching your day-of-week listening habits

**UI Text:** "Matches your [Day] listening habits"

---

### 9. Weekend Listening 🎉
**Dataset Column:** `Weekend_Flag`

**How it works:**
- Separates weekend vs. weekday listening patterns
- Analyzes genres and artists preferred on weekends
- Scores based on weekend listening ratio and genre/artist match
- Weight: 40% genre match + 30% artist match + 30% weekend ratio

**What gets ranked first:**
- Songs matching your weekend genre preferences
- Songs from artists you listen to on weekends
- Songs with high weekend listening ratio

**UI Text:** "Matches your weekend listening preferences"

---

### 10. Location 📍
**Dataset Column:** `Location`

**How it works:**
- Analyzes location-based listening patterns
- Scores songs matching locations you listen in
- Weight: 60% frequency + 40% rating

**What gets ranked first:**
- Songs matching genres you listen to in specific locations
- Songs matching your location-based preferences

**UI Text:** "Matches your [Location] listening patterns"

---

### 11. Device 📱
**Dataset Column:** `Device`

**How it works:**
- Analyzes device-based listening patterns (Phone, Computer, etc.)
- Scores songs matching device-specific preferences
- Weight: 60% frequency + 40% rating

**What gets ranked first:**
- Songs matching genres you listen to on specific devices
- Songs matching your device-based preferences

**UI Text:** "Matches your [Device] listening patterns"

---

### 12. Weather ☁️
**Dataset Column:** `Weather`

**How it works:**
- Analyzes weather-based listening patterns
- Scores songs matching weather conditions you listen in
- Weight: 60% frequency + 40% rating

**What gets ranked first:**
- Songs matching genres you listen to in specific weather
- Songs matching your weather-based preferences

**UI Text:** "Matches your [Weather] listening preferences"

---

### 13. Recommendation Source 🔍
**Dataset Column:** `Recommendation_Source`

**How it works:**
- Analyzes which recommendation sources you engage with most
- Scores songs from sources you interact with frequently
- Weight: 40% frequency + 30% rating + 30% completion

**What gets ranked first:**
- Songs from recommendation sources you use most
- Songs from sources you rate highly
- Songs from sources you complete most

**UI Text:** "From [Source] you engage with"

---

### 14. User Action ⚡
**Dataset Column:** `Skip_Flag`, `Repeat_Count`, `Added_To_Playlist`

**How it works:**
- Analyzes interaction patterns (skips, repeats, playlist adds)
- Scores based on: 40% repeat ratio + 40% playlist ratio + 20% (1 - skip ratio)
- Prefers songs you repeat and add to playlists
- Avoids songs you skip

**What gets ranked first:**
- Songs you've repeated multiple times
- Songs you've added to playlists
- Songs you rarely skip

**UI Text:** "Based on your interaction patterns (repeats, playlists, skips)"

---

### 15. Listening History Flags 🏷️
**Dataset Column:** `Previously_Listened`

**How it works:**
- Analyzes new vs. previously listened music preferences
- If you prefer new music (>50% new): scores songs similar to new discoveries
- If you prefer familiar music: scores songs similar to previously listened
- Considers genre preferences for each category

**What gets ranked first:**
- New music similar to your new discoveries (if you like new music)
- Familiar music similar to previously listened (if you prefer familiar)

**UI Text:** "Based on your new vs. familiar music preferences"

---

## API Endpoint

**Endpoint:** `GET /api/recommendations-by-category/:userId/:category`

**Parameters:**
- `userId`: User ID (integer)
- `category`: Category name (string, URL-encoded)

**Query Parameters:**
- `limit`: Number of recommendations (default: 50)

**Response:**
```json
{
  "recommendations": [
    {
      "title": "Song Title",
      "artist": "Artist Name",
      "genre": "Genre",
      "similarity_score": 0.85,
      "matchLevel": "highly",
      "matchLevelText": "Highly Recommended",
      "explanation": "Category-specific explanation"
    }
  ],
  "hasMore": false,
  "category": "genre",
  "offset": 0
}
```

---

## Frontend Integration

### Side Panel
- Located on the left side of the recommendations page
- Shows 15 clickable category buttons
- "All Recommendations" button to return to hybrid recommendations
- Active category is highlighted

### Category Selection
- Clicking a category:
  1. Highlights the button
  2. Shows loading state
  3. Fetches category-specific recommendations
  4. Updates header to show category name
  5. Displays filtered results with percentages

### Display
- Same card layout as hybrid recommendations
- Percentages normalized within category results
- Color gradients based on match level
- YouTube play buttons work the same way

---

## Implementation Details

### Method: `getRecommendationsBy(category, userId, context, topK)`

**Location:** `musicrec.js`

**Parameters:**
- `category`: One of the 15 category names
- `userId`: User ID string
- `context`: Context object (hour, activity, mood)
- `topK`: Number of recommendations to return

**Returns:**
- Array of recommendation objects with:
  - `title`: Song title
  - `artist`: Artist name
  - `genre`: Genre
  - `score`: Raw score (0-1)
  - `explanation`: Category-specific explanation

**Normalization:**
- Scores are normalized in `index.js` endpoint
- Min-max normalization across all recommendations in the category
- Converted to percentages (0-100%)

---

## Usage Example

```javascript
// In musicrec.js
const recommendations = recSystem.getRecommendationsBy('mood', 'U001', { hour: 18 }, 50);

// Via API
GET /api/recommendations-by-category/1/mood?limit=50
```

---

## Notes

- Each category is **independent** - produces its own ranked list
- Categories use **only** their specific dimension for scoring
- All categories integrate with existing dataset structure
- Percentages are relative to the category's recommendation set
- UI remains consistent with existing design
- Categories work with the same CSV structure


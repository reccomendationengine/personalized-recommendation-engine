# How the Music Recommendation Engine Works

## Overview
The recommendation engine uses a **Hybrid Approach** combining two methods:
1. **2-Tower Algorithm** (Embedding-based similarity)
2. **Pattern Recognition** (Behavioral analysis)

---

## 📊 Where Percentages Come From

### Step 1: Raw Score Calculation
Each song gets a **raw score** from the recommendation engine based on multiple factors:

#### 2-Tower Algorithm Score (from `calculateMatchScore`):
```javascript
score = (genreScore × 0.4) + 
        (artistScore × 0.2) + 
        (contextScore × 0.2) + 
        (performanceScore × 0.2)
```

**Breakdown:**
- **40% - Genre Matching**: How well the song's genre matches your listening history
- **20% - Artist Preference**: Based on how much you've listened to/liked this artist
- **20% - Context Matching**: Time of day, activity, mood alignment
- **20% - Song Performance**: Average completion rate, ratings, and likes from all users

#### Pattern-Based Score:
- Songs matching your time patterns (morning/afternoon/evening/night preferences)
- Songs matching your activity patterns (workout, study, relax, etc.)
- Songs matching your mood patterns (happy, sad, energetic, etc.)

### Step 2: Hybrid Combination
The engine combines both approaches:
```javascript
finalScore = twoTowerScore + patternScore
```

### Step 3: Normalization to Percentage (in `index.js`)
```javascript
// Find min and max scores from ALL recommendations
maxScore = highest score in the set
minScore = lowest score in the set
scoreRange = maxScore - minScore

// Normalize each score to 0-1 range
normalizedScore = (rawScore - minScore) / scoreRange

// Convert to percentage (0-100%)
percentage = normalizedScore × 100
```

**Example:**
- If highest score = 0.85 and lowest = 0.20
- A song with raw score 0.65 becomes: (0.65 - 0.20) / (0.85 - 0.20) = 0.692 = **69.2%**

### Step 4: Match Level Classification
- **≥80%**: "Highly Recommended" (Green)
- **≥50%**: "Moderately Recommended" (Yellow-Green)
- **<50%**: "You May Like" (Light Yellow/White)

---

## 🎯 How the Engine Recommends

### Phase 1: Data Loading & Analysis
When you upload your CSV file:

1. **Load History**: Parses your listening history from CSV
2. **Pattern Analysis** (`analyzeUserPatterns`):
   - **Time Patterns**: What genres/artists you listen to at different times
   - **Genre Preferences**: Your favorite genres based on listening frequency
   - **Activity Patterns**: What you listen to during different activities
   - **Mood Patterns**: Music preferences based on mood
   - **Artist Preferences**: Weighted scores for artists you like

### Phase 2: Embedding Creation (2-Tower Model)

#### User Tower (`initializeUserTower`):
Creates a "profile vector" for you based on:
- **Genre Vector**: Weighted preferences for each genre
- **Time Vector**: When you typically listen
- **Activity Vector**: What you listen to during activities
- **Mood Vector**: Mood-based preferences
- **Behavior Vector**: Listening habits (completion rates, skips, repeats)

#### Item Tower (`initializeItemTower`):
Creates a "song vector" for each track:
- Genre, sub-genre, artist, year, duration
- Average completion rate across all users
- Average rating
- Like ratio (how many users liked it)
- Listening patterns (when/where it's typically played)

### Phase 3: Recommendation Generation

#### Method 1: 2-Tower Recommendations (`getRecommendations`)
1. Gets your user embedding
2. Compares it with all song embeddings using cosine similarity
3. Calculates match score using weighted factors (40% genre, 20% artist, 20% context, 20% performance)
4. Returns top K songs sorted by score

#### Method 2: Pattern-Based Recommendations (`getPatternBasedRecommendations`)
1. Checks current context (time of day, activity, mood)
2. Finds songs matching your patterns for that context
3. Scores based on how well they match your historical patterns
4. Returns top songs from matching genres/artists

#### Method 3: Hybrid Combination (`getHybridRecommendations`)
1. Gets recommendations from both methods
2. Combines and deduplicates
3. Re-ranks by combined score
4. Returns final top recommendations

### Phase 4: Context-Aware Filtering
The engine considers:
- **Current Time**: Recommends songs you typically listen to at this hour
- **Activity** (if provided): Filters by activity patterns
- **Mood** (if provided): Filters by mood patterns

---

## 🔍 Example Flow

**User uploads CSV →**
1. System analyzes: "User listens to Pop at 6pm, Rock during workouts, Jazz when relaxing"
2. Creates embeddings: User vector = [Pop: 0.8, Rock: 0.6, Jazz: 0.4, ...]
3. Current time: 6pm → Context = {hour: 18}
4. Engine finds:
   - 2-Tower: Songs with high genre similarity to Pop
   - Pattern: Songs matching "evening Pop" pattern
5. Combines scores: Song A gets 0.75 (2-tower) + 0.10 (pattern) = 0.85
6. Normalizes: If max=0.90, min=0.20 → (0.85-0.20)/(0.90-0.20) = 0.929 = **92.9%**
7. Classifies: 92.9% ≥ 80% → "Highly Recommended" (Green)

---

## 📈 Key Features

1. **Personalized**: Based on YOUR listening history, not general popularity
2. **Context-Aware**: Adapts to time of day and activity
3. **Hybrid Approach**: Combines embedding similarity with behavioral patterns
4. **Normalized Scores**: Percentages are relative to YOUR recommendation set, not absolute
5. **Multi-Factor**: Considers genre, artist, time, activity, mood, and performance

---

## 🎨 Visual Representation

```
Your CSV Data
    ↓
Pattern Analysis (Time, Genre, Activity, Mood, Artist)
    ↓
2-Tower Model (User Embeddings + Song Embeddings)
    ↓
Hybrid Recommendations (Combine both methods)
    ↓
Score Calculation (Weighted factors)
    ↓
Normalization (0-100%)
    ↓
Match Level (Highly/Moderately/May Like)
    ↓
Display with Color Gradient
```

---

## 💡 Why Percentages Can Vary

- **Relative Scoring**: Percentages are normalized within YOUR recommendation set
- **Context Changes**: Different times/activities yield different scores
- **Data Quality**: More listening history = better pattern recognition
- **Score Distribution**: If all songs score similarly, percentages will be closer together

---

## 🔧 Technical Details

**Files:**
- `musicrec.js`: Core recommendation engine (MusicRecommendationSystem class)
- `index.js`: API endpoints, normalization, and percentage calculation

**Key Functions:**
- `analyzeUserPatterns()`: Analyzes your listening patterns
- `initializeTwoTowerModel()`: Creates embeddings
- `getHybridRecommendations()`: Main recommendation method
- `calculateMatchScore()`: Computes similarity scores
- Normalization in `index.js` line 481-492: Converts scores to percentages


/**
 * MovieRecommendationSystem - Category-Based Movie Recommendations
 * 
 * Implements a movie recommendation engine supporting 20 descriptive categories:
 * - 8 Genre categories (Action, Comedy, Drama, Romance, Horror, Sci-Fi, Adventure, Animation)
 * - 6 Hybrid categories (Action+Adventure, Comedy+Romance, etc.)
 * - 4 Time-based categories (Classic, Modern, Recent, Newest)
 * - 2 Mood categories (Feel-Good, Emotional/Deep)
 */
class MovieRecommendationSystem {
    constructor() {
        this.movies = []; // All movies from CSV
        this.movieMap = new Map(); // Quick lookup by title+year
    }

    /**
     * Loads and parses CSV data into movies array
     * Handles multiple CSV formats: movieId,title,genres or Title,Year,Genres
     * @param {string} csvData - Raw CSV string with movie data
     */
    loadData(csvData) {
        const lines = csvData.split('\n').filter(line => line.trim());
        if (lines.length === 0) return;
        
        // Detect header and map column indices
        const firstLine = lines[0].toLowerCase();
        const headerFields = this.parseCSVLine(firstLine);
        const hasHeader = headerFields.some(field => 
            field.includes('title') || field.includes('name') || field.includes('movie') ||
            field.includes('year') || field.includes('genre')
        );
        
        let titleIndex = -1, yearIndex = -1, genreIndex = -1, idIndex = -1;
        
        if (hasHeader) {
            // Map columns by header names
            headerFields.forEach((field, index) => {
                const fieldLower = field.trim().toLowerCase();
                if ((fieldLower === 'title' || fieldLower.includes('title') || fieldLower.includes('name')) && 
                    !fieldLower.includes('id') && !fieldLower.includes('movieid')) {
                    titleIndex = index;
                } else if (fieldLower.includes('year') || fieldLower.includes('release')) {
                    yearIndex = index;
                } else if (fieldLower.includes('genre') || fieldLower.includes('category')) {
                    genreIndex = index;
                } else if ((fieldLower.includes('id') || fieldLower === 'movieid') && 
                          !fieldLower.includes('title') && !fieldLower.includes('name')) {
                    idIndex = index;
                }
            });
        }
        
        // Auto-detect format: movieId, title, genres (if no header)
        if (!hasHeader && lines.length > 0) {
            const firstDataLine = this.parseCSVLine(lines[0]);
            if (firstDataLine.length === 3) {
                const firstField = firstDataLine[0].trim();
                const secondField = firstDataLine[1].trim();
                if (/^\d+$/.test(firstField) && secondField.length > 2 && !/^\d+$/.test(secondField)) {
                    idIndex = 0; titleIndex = 1; genreIndex = 2;
                }
            }
        }
        
        const dataLines = (!hasHeader && titleIndex >= 0) ? lines : (hasHeader ? lines.slice(1) : lines);
        
        // Parse each line into movie object
        this.movies = dataLines.map((line, index) => {
            const fields = this.parseCSVLine(line);
            let title = '', year = null, genres = '';
            
            // Extract data using detected column indices
            if (titleIndex >= 0 && titleIndex < fields.length) {
                title = fields[titleIndex].trim();
                
                // Extract year from title format "Title (Year)"
                const yearMatch = title.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = parseInt(yearMatch[1]);
                    title = title.replace(/\s*\(\d{4}\)\s*/, '').trim();
                }
                
                // Check separate year column if year not in title
                if (!year && yearIndex >= 0 && yearIndex < fields.length) {
                    const yearField = parseInt(fields[yearIndex].trim());
                    if (!isNaN(yearField) && yearField >= 1900 && yearField <= 2100) year = yearField;
                }
                
                // Get genres column
                if (genreIndex >= 0 && genreIndex < fields.length) {
                    genres = fields[genreIndex].trim();
                } else {
                    // Auto-detect genres column
                    for (let i = 0; i < fields.length; i++) {
                        if (i !== titleIndex && i !== yearIndex && i !== idIndex) {
                            const field = fields[i].trim();
                            if (field.length > 0 && (field.includes('|') || field.includes(',') || 
                                /action|comedy|drama|romance|horror|sci-fi|adventure|animation|family|thriller|fantasy|children/i.test(field))) {
                                genres = field;
                                break;
                            }
                        }
                    }
                }
            } else {
                // Fallback: find first non-numeric field as title
                for (let i = 0; i < fields.length; i++) {
                    const field = fields[i].trim();
                    const isNumeric = /^\d+$/.test(field);
                    const isYear = !isNaN(parseInt(field)) && parseInt(field) >= 1900 && parseInt(field) <= 2100;
                    
                    if (!isNumeric && !isYear && field.length > 2) {
                        const yearMatch = field.match(/\((\d{4})\)/);
                        if (yearMatch) {
                            title = field.replace(/\s*\(\d{4}\)\s*/, '').trim();
                            year = parseInt(yearMatch[1]);
                            if (i + 1 < fields.length) genres = fields[i + 1].trim();
                            break;
                        } else if (field.length > 3) {
                            title = field;
                            if (i + 1 < fields.length) {
                                const nextField = parseInt(fields[i + 1].trim());
                                if (!isNaN(nextField) && nextField >= 1900 && nextField <= 2100) {
                                    year = nextField;
                                    if (i + 2 < fields.length) genres = fields.slice(i + 2).join(',').trim();
                                } else {
                                    genres = fields[i + 1].trim();
                                    const lastField = parseInt(fields[fields.length - 1].trim());
                                    if (!isNaN(lastField) && lastField >= 1900 && lastField <= 2100) year = lastField;
                                }
                            }
                            break;
                        }
                    }
                }
            }
            
            // Final year extraction from title if still missing
            if (!year && title) {
                const titleYearMatch = title.match(/\((\d{4})\)/);
                if (titleYearMatch) {
                    year = parseInt(titleYearMatch[1]);
                    title = title.replace(/\s*\(\d{4}\)\s*/, '').trim();
                }
            }
            
            // Fix title if it's just a number (ID)
            if (/^\d+$/.test(title.trim()) && fields.length > 1) {
                for (let i = 0; i < fields.length; i++) {
                    const field = fields[i].trim();
                    if (!/^\d+$/.test(field) && field.length > 2 && 
                        !(parseInt(field) >= 1900 && parseInt(field) <= 2100)) {
                        title = field;
                        if (i + 1 < fields.length) {
                            const yearCandidate = parseInt(fields[i + 1].trim());
                            if (!isNaN(yearCandidate) && yearCandidate >= 1900 && yearCandidate <= 2100) year = yearCandidate;
                        }
                        break;
                    }
                }
            }
            
            // Parse genres (supports pipe, comma, semicolon separators)
            const genreList = genres.split(/[,|;]/).map(g => g.trim()).filter(g => g.length > 0);
            
            // Skip if title is invalid
            if (!title || title.length === 0 || /^\d+$/.test(title.trim())) return null;
            
            return {
                id: index,
                title: title,
                year: year || null,
                genres: genreList,
                genresString: genres || '',
                originalLine: line
            };
        }).filter(movie => movie !== null);
    }

    /**
     * Parses CSV line handling quoted fields and escaped quotes
     * @param {string} line - CSV line to parse
     * @returns {Array} Array of field values
     */
    parseCSVLine(line) {
        const fields = [];
        let current = '', inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                fields.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        fields.push(current);
        return fields;
    }

    /**
     * Extracts year from title text (e.g., "Toy Story (1995)" -> 1995)
     * @param {string} title - Movie title
     * @returns {number|null} Year or null if not found
     */
    extractYearFromTitle(title) {
        if (!title) return null;
        const match = title.match(/\((\d{4})\)/);
        return match ? parseInt(match[1]) : null;
    }

    /**
     * Checks if movie has a specific genre (case-insensitive, partial match)
     * @param {Object} movie - Movie object
     * @param {string} genre - Genre to check
     * @returns {boolean} True if movie has the genre
     */
    hasGenre(movie, genre) {
        if (!movie.genres || movie.genres.length === 0) return false;
        const genreLower = genre.toLowerCase().trim();
        return movie.genres.some(g => g.toLowerCase().includes(genreLower));
    }

    /**
     * Gets recommendations by category with scoring and ranking
     * @param {string} category - Category name (one of 20 categories)
     * @param {number} topK - Maximum recommendations (default: 20)
     * @returns {Array} Array of recommended movies with scores
     */
    getRecommendationsByCategory(category, topK = 20) {
        const categoryLower = category.toLowerCase().trim();
        let filteredMovies = [];
        
        // Filter movies by category rules
        switch(categoryLower) {
            // Genre categories
            case 'action movies': case 'action':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Action'));
                filteredMovies.sort((a, b) => {
                    const aFirst = a.genres[0]?.toLowerCase() === 'action' ? 1 : 0;
                    const bFirst = b.genres[0]?.toLowerCase() === 'action' ? 1 : 0;
                    if (aFirst !== bFirst) return bFirst - aFirst;
                    const aHas = (this.hasGenre(a, 'Adventure') || this.hasGenre(a, 'Thriller')) ? 1 : 0;
                    const bHas = (this.hasGenre(b, 'Adventure') || this.hasGenre(b, 'Thriller')) ? 1 : 0;
                    return bHas - aHas;
                });
                break;
            case 'comedy movies': case 'comedy':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Comedy'));
                break;
            case 'drama movies': case 'drama':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Drama'));
                break;
            case 'romance movies': case 'romance':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Romance'));
                break;
            case 'horror movies': case 'horror':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Horror'));
                filteredMovies.sort((a, b) => {
                    const aHas = (this.hasGenre(a, 'Thriller') || this.hasGenre(a, 'Mystery') || this.hasGenre(a, 'Sci-Fi')) ? 1 : 0;
                    const bHas = (this.hasGenre(b, 'Thriller') || this.hasGenre(b, 'Mystery') || this.hasGenre(b, 'Sci-Fi')) ? 1 : 0;
                    return bHas - aHas;
                });
                break;
            case 'sci-fi movies': case 'sci-fi': case 'science fiction':
                filteredMovies = this.movies.filter(m => 
                    this.hasGenre(m, 'Sci-Fi') || this.hasGenre(m, 'Science Fiction') || this.hasGenre(m, 'SciFi')
                );
                break;
            case 'adventure movies': case 'adventure':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Adventure'));
                break;
            case 'animation & family movies': case 'animation': case 'family':
                filteredMovies = this.movies.filter(m => 
                    this.hasGenre(m, 'Animation') || this.hasGenre(m, 'Family') || this.hasGenre(m, 'Children')
                );
                filteredMovies.sort((a, b) => {
                    const aAnimated = this.hasGenre(a, 'Animation') ? 1 : 0;
                    const bAnimated = this.hasGenre(b, 'Animation') ? 1 : 0;
                    if (aAnimated !== bAnimated) return bAnimated - aAnimated;
                    const aFamily = (this.hasGenre(a, 'Family') || this.hasGenre(a, 'Children')) ? 1 : 0;
                    const bFamily = (this.hasGenre(b, 'Family') || this.hasGenre(b, 'Children')) ? 1 : 0;
                    return bFamily - aFamily;
                });
                break;
            
            // Hybrid categories
            case 'action + adventure': case 'action+adventure':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Action') && this.hasGenre(m, 'Adventure'));
                break;
            case 'comedy + romance': case 'comedy+romance':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Comedy') && this.hasGenre(m, 'Romance'));
                break;
            case 'drama + thriller': case 'drama+thriller':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Drama') && this.hasGenre(m, 'Thriller'));
                break;
            case 'sci-fi + thriller': case 'sci-fi+thriller': case 'science fiction + thriller':
                filteredMovies = this.movies.filter(m => 
                    (this.hasGenre(m, 'Sci-Fi') || this.hasGenre(m, 'Science Fiction')) && this.hasGenre(m, 'Thriller')
                );
                break;
            case 'horror + mystery': case 'horror+mystery':
                filteredMovies = this.movies.filter(m => this.hasGenre(m, 'Horror') && this.hasGenre(m, 'Mystery'));
                break;
            case 'comedy + family': case 'comedy+family':
                filteredMovies = this.movies.filter(m => 
                    this.hasGenre(m, 'Comedy') && (this.hasGenre(m, 'Family') || this.hasGenre(m, 'Children'))
                );
                break;
            
            // Time-based categories
            case 'classic movies': case 'classic':
                filteredMovies = this.movies.filter(m => {
                    const year = m.year || this.extractYearFromTitle(m.title);
                    return year && year < 2000;
                });
                filteredMovies.sort((a, b) => {
                    const yearA = a.year || this.extractYearFromTitle(a.title) || 0;
                    const yearB = b.year || this.extractYearFromTitle(b.title) || 0;
                    return yearB - yearA;
                });
                break;
            case 'modern movies': case 'modern':
                filteredMovies = this.movies.filter(m => {
                    const year = m.year || this.extractYearFromTitle(m.title);
                    return year && year >= 2000 && year <= 2010;
                });
                filteredMovies.sort((a, b) => {
                    const yearA = a.year || this.extractYearFromTitle(a.title) || 0;
                    const yearB = b.year || this.extractYearFromTitle(b.title) || 0;
                    return yearB - yearA;
                });
                break;
            case 'recent movies': case 'recent':
                filteredMovies = this.movies.filter(m => {
                    const year = m.year || this.extractYearFromTitle(m.title);
                    return year && year >= 2010 && year <= 2020;
                });
                filteredMovies.sort((a, b) => {
                    const yearA = a.year || this.extractYearFromTitle(a.title) || 0;
                    const yearB = b.year || this.extractYearFromTitle(b.title) || 0;
                    return yearB - yearA;
                });
                break;
            case 'newest movies': case 'newest':
                filteredMovies = this.movies.filter(m => {
                    const year = m.year || this.extractYearFromTitle(m.title);
                    return year && year > 2020;
                });
                filteredMovies.sort((a, b) => {
                    const yearA = a.year || this.extractYearFromTitle(a.title) || 0;
                    const yearB = b.year || this.extractYearFromTitle(b.title) || 0;
                    return yearB - yearA;
                });
                break;
            
            // Mood categories
            case 'feel-good movies': case 'feel-good': case 'feelgood':
                filteredMovies = this.movies.filter(m => 
                    this.hasGenre(m, 'Comedy') || this.hasGenre(m, 'Animation') ||
                    this.hasGenre(m, 'Family') || this.hasGenre(m, 'Romance')
                );
                filteredMovies.sort((a, b) => {
                    const aScore = (this.hasGenre(a, 'Comedy') ? 2 : 0) + (this.hasGenre(a, 'Animation') ? 2 : 0) +
                                  (this.hasGenre(a, 'Family') ? 1 : 0) + (this.hasGenre(a, 'Romance') ? 1 : 0);
                    const bScore = (this.hasGenre(b, 'Comedy') ? 2 : 0) + (this.hasGenre(b, 'Animation') ? 2 : 0) +
                                  (this.hasGenre(b, 'Family') ? 1 : 0) + (this.hasGenre(b, 'Romance') ? 1 : 0);
                    return bScore - aScore;
                });
                break;
            case 'emotional / deep movies': case 'emotional': case 'deep movies': case 'deep':
                filteredMovies = this.movies.filter(m => 
                    this.hasGenre(m, 'Drama') || this.hasGenre(m, 'Romance') || this.hasGenre(m, 'Biography')
                );
                filteredMovies.sort((a, b) => {
                    const aDrama = this.hasGenre(a, 'Drama') ? 2 : 0;
                    const bDrama = this.hasGenre(b, 'Drama') ? 2 : 0;
                    if (aDrama !== bDrama) return bDrama - aDrama;
                    const aRomance = this.hasGenre(a, 'Romance') ? 1 : 0;
                    const bRomance = this.hasGenre(b, 'Romance') ? 1 : 0;
                    return bRomance - aRomance;
                });
                break;
            default:
                filteredMovies = [...this.movies];
                break;
        }
        
        // Score and rank movies
        const scoredMovies = filteredMovies.map(movie => ({
            title: movie.title,
            year: movie.year || this.extractYearFromTitle(movie.title),
            genres: movie.genres.join(', '),
            genresArray: movie.genres,
            score: this.calculateMovieScore(movie, categoryLower),
            explanation: this.generateExplanation(movie, categoryLower)
        }));
        
        // Sort by score and apply position-based boost for better distribution
        scoredMovies.sort((a, b) => b.score - a.score);
        
        return scoredMovies.slice(0, topK).map((movie, index) => {
            const positionRatio = index / Math.max(topK, 1);
            let positionBoost = 0;
            
            // Position-based boost: top movies get higher scores
            if (positionRatio < 0.15) positionBoost = 0.5 - (positionRatio * 0.67);
            else if (positionRatio < 0.4) positionBoost = 0.4 - ((positionRatio - 0.15) * 0.6);
            else if (positionRatio < 0.7) positionBoost = 0.25 - ((positionRatio - 0.4) * 0.5);
            else positionBoost = 0.1 - ((positionRatio - 0.7) * 0.33);
            
            return {
                ...movie,
                score: Math.min(movie.score + positionBoost, 1.0)
            };
        });
    }

    /**
     * Calculates base score for a movie based on category match quality
     * @param {Object} movie - Movie object
     * @param {string} category - Category name
     * @returns {number} Score between 0.3 and 1.0
     */
    calculateMovieScore(movie, category) {
        let score = 0.3; // Base score
        
        // Genre count bonus
        score += Math.min(movie.genres.length * 0.08, 0.3);
        
        // Category-specific genre position bonus (primary genre gets higher boost)
        const genreKeywords = {
            'action': 'action', 'comedy': 'comedy', 'drama': 'drama', 'romance': 'romance',
            'horror': 'horror', 'sci-fi': ['sci', 'science'], 'adventure': 'adventure',
            'animation': ['animation', 'family', 'children']
        };
        
        for (const [key, value] of Object.entries(genreKeywords)) {
            if (category.includes(key)) {
                const searchTerms = Array.isArray(value) ? value : [value];
                const genreIndex = movie.genres.findIndex(g => 
                    searchTerms.some(term => g.toLowerCase().includes(term))
                );
                if (genreIndex === 0) score += 0.2;
                else if (genreIndex > 0) score += 0.1;
                break;
            }
        }
        
        // Year recency bonus (unless classic category)
        if (movie.year) {
            const age = new Date().getFullYear() - movie.year;
            if (!category.includes('classic')) {
                score += Math.max(0, (30 - age) / 150);
            } else if (age > 20 && age < 50) {
                score += 0.1;
            }
        }
        
        // Hybrid category bonus
        if (category.includes('+') || category.includes('&')) {
            const hybridParts = category.split(/[+&]/).map(p => p.trim().toLowerCase());
            const matchCount = hybridParts.filter(part => 
                movie.genres.some(g => g.toLowerCase().includes(part))
            ).length;
            if (matchCount === hybridParts.length) score += 0.25;
            else if (matchCount > 0) score += 0.1 * matchCount;
        }
        
        return Math.min(score, 1.0);
    }

    /**
     * Generates explanation text for why movie was recommended
     * @param {Object} movie - Movie object
     * @param {string} category - Category name
     * @returns {string} Explanation text
     */
    generateExplanation(movie, category) {
        const year = movie.year || this.extractYearFromTitle(movie.title);
        const yearText = year ? ` (${year})` : '';
        const genreText = movie.genres.join(', ');
        
        const explanations = {
            'action': `Action-packed film${yearText} with ${genreText} genres`,
            'comedy': `Funny and entertaining${yearText} - ${genreText}`,
            'drama': `Emotional and story-driven${yearText} - ${genreText}`,
            'romance': `Romantic film${yearText} - ${genreText}`,
            'horror': `Thrilling horror${yearText} - ${genreText}`,
            'sci-fi': `Futuristic sci-fi${yearText} - ${genreText}`,
            'adventure': `Exciting adventure${yearText} - ${genreText}`,
            'animation': `Family-friendly${yearText} - ${genreText}`,
            'classic': `Classic film from ${year || 'the past'} - ${genreText}`,
            'modern': `Modern film from ${year || '2000s'} - ${genreText}`,
            'recent': `Recent release from ${year || '2010s'} - ${genreText}`,
            'newest': `Latest release from ${year || 'recent years'} - ${genreText}`,
            'feel-good': `Uplifting and positive${yearText} - ${genreText}`,
            'emotional': `Deep and emotional${yearText} - ${genreText}`
        };
        
        for (const [key, explanation] of Object.entries(explanations)) {
            if (category.includes(key)) return explanation;
        }
        
        return `Recommended${yearText} - ${genreText}`;
    }

    /**
     * Returns all movies (for general recommendations without category filter)
     * @param {number} limit - Maximum number of movies to return
     * @returns {Array} Array of movie objects with default scores
     */
    getAllMovies(limit = 50) {
        return this.movies.slice(0, limit).map(movie => ({
            title: movie.title,
            year: movie.year || this.extractYearFromTitle(movie.title),
            genres: movie.genres.join(', '),
            genresArray: movie.genres,
            score: 0.5,
            explanation: `Movie from ${movie.year || 'unknown year'} - ${movie.genres.join(', ')}`
        }));
    }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MovieRecommendationSystem;
}

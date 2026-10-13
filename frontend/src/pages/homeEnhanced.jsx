import { ChevronRight, MapPin, Search, Trending2, Clock, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EventCard from "../components/EventCard";
import { useAuth } from "../context/AuthContext";
import api from "../api";
import "../styles/home-enhanced.css";

export default function HomeEnhanced() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState("date");

  // Data state
  const [searchResults, setSearchResults] = useState([]);
  const [featured, setFeatured] = useState({ featured: [], trending: [], upcoming: [] });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [error, setError] = useState("");

  // Load categories and featured events
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [categoriesRes, featuredRes] = await Promise.all([
          api.get("/api/v2/categories"),
          api.get("/api/v2/featured"),
        ]);
        setCategories(categoriesRes.data.categories || []);
        setFeatured(featuredRes.data);
      } catch (err) {
        console.error("Failed to load initial data:", err);
      }
    };
    loadInitial();
  }, []);

  // Advanced search
  const handleSearch = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("q", searchQuery);
      if (category) params.append("category", category);
      if (location) params.append("location", location);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (priceMin) params.append("price_min", priceMin);
      if (priceMax) params.append("price_max", priceMax);
      params.append("sort", sort);

      const response = await api.get(`/api/v2/search?${params}`);
      setSearchResults(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCategory("");
    setLocation("");
    setDateFrom("");
    setDateTo("");
    setPriceMin("");
    setPriceMax("");
    setSort("date");
    setSearchResults([]);
  };

  const renderEventSection = (title, events, sectionClass) => (
    <div className={`events-carousel ${sectionClass}`}>
      <h3 className="carousel-title">{title}</h3>
      <div className="carousel-container">
        {events && events.length > 0 ? (
          events.map((event) => (
            <div key={event.id} className="carousel-item" onClick={() => navigate(`/events/${event.id}`)}>
              <EventCard event={event} />
            </div>
          ))
        ) : (
          <div className="empty-carousel">No events available</div>
        )}
      </div>
    </div>
  );

  return (
    <main className="home-enhanced">
      {/* Hero Section */}
      <section className="hero-premium">
        <div className="hero-background">
          <div className="gradient-blob blob-1" />
          <div className="gradient-blob blob-2" />
        </div>
        <div className="hero-overlay" />

        <div className="hero-content">
          <div className="hero-text">
            <span className="hero-badge">Discover Amazing Events</span>
            <h1 className="hero-title">
              Your next unforgettable <span className="gradient-text">experience</span> awaits
            </h1>
            <p className="hero-subtitle">
              Book tickets to live concerts, tech talks, sports events, and more. All in one place.
            </p>
          </div>

          {/* Enhanced Search Bar */}
          <form onSubmit={handleSearch} className="search-bar-premium">
            <div className="search-input-wrapper">
              <Search size={20} className="search-icon" />
              <input
                type="text"
                placeholder="Search events, artists, or venues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button type="submit" className="search-button primary-button">
              Search
            </button>
            <button
              type="button"
              className="filter-toggle secondary-button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              ⚙️ Filters
            </button>
          </form>

          {/* Quick Filters */}
          <div className="quick-filters">
            {categories.slice(0, 4).map((cat) => (
              <button
                key={cat.id}
                className={`quick-filter ${category === cat.id ? "active" : ""}`}
                onClick={() => {
                  setCategory(category === cat.id ? "" : cat.id);
                }}
              >
                <span>{cat.icon && <span className="filter-icon">{cat.icon}</span>}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <section className="advanced-filters-panel">
          <div className="filters-grid">
            <div className="filter-group">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>
                <MapPin size={16} /> Location
              </label>
              <input
                type="text"
                placeholder="City or venue"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>
                <Clock size={16} /> Date From
              </label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="filter-group">
              <label>
                <Clock size={16} /> Date To
              </label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="filter-group">
              <label>Min Price (₹)</label>
              <input
                type="number"
                placeholder="0"
                min="0"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Max Price (₹)</label>
              <input
                type="number"
                placeholder="10000"
                min="0"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Sort By</label>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="date">Date</option>
                <option value="price">Price (Low to High)</option>
                <option value="popularity">Popularity</option>
                <option value="rating">Ratings</option>
              </select>
            </div>

            <div className="filter-actions">
              <button className="primary-button" onClick={handleSearch} disabled={loading}>
                {loading ? "Searching..." : "Apply Filters"}
              </button>
              <button className="secondary-button" onClick={clearFilters}>
                Clear All
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <section className="search-results">
          <div className="results-header">
            <h2>Search Results ({searchResults.length} events found)</h2>
            <button className="text-button" onClick={clearFilters}>
              Clear Search <ChevronRight size={16} />
            </button>
          </div>
          <div className="event-grid-premium">
            {searchResults.map((event) => (
              <div key={event.id} onClick={() => navigate(`/events/${event.id}`)}>
                <EventCard event={event} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button className="text-button" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}

      {/* Featured Events Sections */}
      {searchResults.length === 0 && (
        <>
          {/* Featured */}
          <section className="carousel-section">
            <div className="section-header">
              <div>
                <span className="section-badge">⭐ Curated For You</span>
                <h2>Featured Events</h2>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setSearchQuery("");
                  handleSearch();
                }}
              >
                View All <ChevronRight size={16} />
              </button>
            </div>
            {renderEventSection("Highest Rated Events", featured.featured, "featured-carousel")}
          </section>

          {/* Trending */}
          <section className="carousel-section">
            <div className="section-header">
              <div>
                <span className="section-badge">
                  <Trending2 size={16} /> Trending
                </span>
                <h2>Most Popular Right Now</h2>
              </div>
            </div>
            {renderEventSection("Events Everyone's Booking", featured.trending, "trending-carousel")}
          </section>

          {/* Upcoming */}
          <section className="carousel-section">
            <div className="section-header">
              <div>
                <span className="section-badge">
                  <Clock size={16} /> Coming Soon
                </span>
                <h2>Upcoming Events</h2>
              </div>
            </div>
            {renderEventSection("Next 30 Days", featured.upcoming, "upcoming-carousel")}
          </section>
        </>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Searching events...</p>
        </div>
      )}
    </main>
  );
}

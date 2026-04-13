"""
Real-time data module for L.U.N.A
- Date/Time : system clock
- Weather   : Open-Meteo API (no API key required)
- Location  : ip-api.com (free, no key)
- News      : BBC News RSS feed (no key)
"""

import requests
import datetime
import xml.etree.ElementTree as ET
import logging
import time

logger = logging.getLogger("LUNA.realtime")

# ── Simple in-memory cache ─────────────────────────────────────────────────────
_cache: dict = {}
_CACHE_TTL   = 300   # 5 minutes


def _cached(key: str, fn):
    now = time.time()
    if key in _cache and now - _cache[key]["ts"] < _CACHE_TTL:
        return _cache[key]["data"]
    data = fn()
    _cache[key] = {"ts": now, "data": data}
    return data


# ── Date / Time ────────────────────────────────────────────────────────────────

def get_datetime() -> dict:
    now = datetime.datetime.now()
    return {
        "date":      now.strftime("%A, %B %d, %Y"),
        "time":      now.strftime("%I:%M %p"),
        "time_24":   now.strftime("%H:%M:%S"),
        "day":       now.strftime("%A"),
        "month":     now.strftime("%B"),
        "year":      now.year,
        "timestamp": now.isoformat(),
    }


# ── Location (IP-based) ───────────────────────────────────────────────────────

def get_location() -> dict:
    def _fetch():
        try:
            res  = requests.get("http://ip-api.com/json/", timeout=5)
            data = res.json()
            if data.get("status") == "success":
                return {
                    "city":     data.get("city",       "Unknown"),
                    "region":   data.get("regionName", ""),
                    "country":  data.get("country",    "Unknown"),
                    "lat":      data.get("lat",         0.0),
                    "lon":      data.get("lon",         0.0),
                    "timezone": data.get("timezone",   ""),
                    "ok": True,
                }
        except Exception as e:
            logger.warning("Location fetch failed: %s", e)
        return {"city": "Unknown", "country": "Unknown", "lat": 0.0, "lon": 0.0, "ok": False}
    return _cached("location", _fetch)


# ── Weather (Open-Meteo, no API key) ──────────────────────────────────────────

WMO_CODES = {
    0:  "Clear sky",           1:  "Mainly clear",          2:  "Partly cloudy",
    3:  "Overcast",            45: "Foggy",                 48: "Icy fog",
    51: "Light drizzle",       53: "Moderate drizzle",      55: "Dense drizzle",
    61: "Slight rain",         63: "Moderate rain",         65: "Heavy rain",
    71: "Slight snow",         73: "Moderate snow",         75: "Heavy snow",
    77: "Snow grains",         80: "Slight showers",        81: "Moderate showers",
    82: "Violent showers",     85: "Slight snow showers",   86: "Heavy snow showers",
    95: "Thunderstorm",        96: "Thunderstorm + hail",   99: "Thunderstorm + heavy hail",
}


def get_weather(lat: float = None, lon: float = None, city: str = None) -> dict:
    if lat is None or lon is None:
        loc  = get_location()
        lat  = loc["lat"]
        lon  = loc["lon"]
        city = city or loc.get("city", "your location")

    cache_key = f"weather_{lat:.2f}_{lon:.2f}"

    def _fetch():
        try:
            url = (
                f"https://api.open-meteo.com/v1/forecast"
                f"?latitude={lat}&longitude={lon}"
                f"&current=temperature_2m,relative_humidity_2m,"
                f"wind_speed_10m,weather_code,apparent_temperature,precipitation"
                f"&daily=temperature_2m_max,temperature_2m_min,weather_code"
                f"&forecast_days=3&timezone=auto"
            )
            res  = requests.get(url, timeout=10)
            data = res.json()
            curr  = data.get("current", {})
            daily = data.get("daily",   {})

            code      = curr.get("weather_code", -1)
            condition = WMO_CODES.get(code, "Unknown conditions")

            forecast = []
            dates       = daily.get("time",               [])
            max_temps   = daily.get("temperature_2m_max", [])
            min_temps   = daily.get("temperature_2m_min", [])
            daily_codes = daily.get("weather_code",        [])
            for i in range(min(3, len(dates))):
                forecast.append({
                    "date":      dates[i],
                    "max_temp":  max_temps[i]   if i < len(max_temps)   else None,
                    "min_temp":  min_temps[i]   if i < len(min_temps)   else None,
                    "condition": WMO_CODES.get(daily_codes[i], "Unknown") if i < len(daily_codes) else "Unknown",
                })

            return {
                "ok":            True,
                "city":          city,
                "temperature_c": curr.get("temperature_2m"),
                "feels_like_c":  curr.get("apparent_temperature"),
                "humidity":      curr.get("relative_humidity_2m"),
                "wind_kmh":      curr.get("wind_speed_10m"),
                "precipitation": curr.get("precipitation", 0),
                "condition":     condition,
                "forecast":      forecast,
            }
        except Exception as e:
            logger.warning("Weather fetch failed: %s", e)
            return {"ok": False, "msg": str(e)}

    return _cached(cache_key, _fetch)


# ── News (BBC RSS, no API key) ────────────────────────────────────────────────

RSS_FEEDS = {
    "world":      "http://feeds.bbci.co.uk/news/world/rss.xml",
    "technology": "http://feeds.bbci.co.uk/news/technology/rss.xml",
    "science":    "http://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    "business":   "http://feeds.bbci.co.uk/news/business/rss.xml",
    "general":    "http://feeds.bbci.co.uk/news/rss.xml",
    "sports":     "http://feeds.bbci.co.uk/sport/rss.xml",
}


def get_news(topic: str = "general", count: int = 5) -> dict:
    topic    = topic.lower().strip()
    feed_url = RSS_FEEDS.get(topic, RSS_FEEDS["general"])

    def _fetch():
        try:
            headers = {"User-Agent": "Mozilla/5.0 LUNA/7.0 (compatible)"}
            res     = requests.get(feed_url, timeout=10, headers=headers)
            root    = ET.fromstring(res.content)
            items   = []
            for item in root.findall(".//item")[:count]:
                title = (item.findtext("title") or "").strip()
                desc  = (item.findtext("description") or "").strip()
                if title:
                    items.append({
                        "title":       title,
                        "description": desc[:200] if desc else "",
                    })
            return {"ok": True, "topic": topic, "source": "BBC News", "headlines": items}
        except Exception as e:
            logger.warning("News fetch failed: %s", e)
            return {"ok": False, "msg": str(e), "headlines": []}

    return _cached(f"news_{topic}", _fetch)


# ── Full context bundle ───────────────────────────────────────────────────────

def get_realtime_context() -> dict:
    dt   = get_datetime()
    loc  = get_location()
    wx   = get_weather(lat=loc.get("lat", 0), lon=loc.get("lon", 0), city=loc.get("city"))
    news = get_news("general", 5)
    return {"datetime": dt, "location": loc, "weather": wx, "news": news}


def format_context_for_ai(ctx: dict) -> str:
    """Format real-time context as a readable string to inject into AI prompt."""
    parts = []

    dt = ctx.get("datetime", {})
    if dt:
        parts.append(f"Current date & time: {dt.get('date', '')} at {dt.get('time', '')}")

    loc = ctx.get("location", {})
    wx  = ctx.get("weather",  {})
    if wx.get("ok"):
        city  = wx.get("city", loc.get("city", ""))
        temp  = wx.get("temperature_c")
        feels = wx.get("feels_like_c")
        cond  = wx.get("condition", "")
        hum   = wx.get("humidity")
        wind  = wx.get("wind_kmh")
        lines = [f"Current weather in {city}: {cond}"]
        if temp is not None:
            fl = f" (feels like {feels}°C)" if feels is not None else ""
            lines.append(f"  Temperature: {temp}°C{fl}")
        if hum is not None:
            lines.append(f"  Humidity: {hum}%  |  Wind: {wind} km/h")
        fc = wx.get("forecast", [])
        if fc:
            fc_str = " | ".join(
                f"{f['date']}: {f['condition']} ({f['min_temp']}–{f['max_temp']}°C)"
                for f in fc
            )
            lines.append(f"  3-day forecast: {fc_str}")
        parts.append("\n".join(lines))

    news = ctx.get("news", {})
    if news.get("ok") and news.get("headlines"):
        hl = "\n".join(f"  • {h['title']}" for h in news["headlines"][:5])
        parts.append(f"Today's top news headlines (BBC):\n{hl}")

    return "\n\n".join(parts)

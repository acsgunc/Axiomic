//! Minimal, dependency-free CSV parser for OHLCV data.
//!
//! Kept tiny and allocation-light so it compiles cleanly to WASM without
//! pulling in heavyweight parsing crates.

use crate::types::Candle;

/// Parses an OHLCV CSV document into candles, sorted ascending by time.
///
/// The header is matched case-insensitively and columns may appear in any
/// order. A time column named `date`, `time`, `timestamp`, or `datetime` is
/// required, along with `open`, `high`, `low`, `close`. `volume` is optional.
pub fn parse_csv(input: &str) -> Result<Vec<Candle>, String> {
    let mut lines = input.lines().filter(|l| !l.trim().is_empty());
    let header = lines.next().ok_or("CSV is empty")?;
    let cols: Vec<String> = split_row(header)
        .into_iter()
        .map(|c| c.trim().to_lowercase())
        .collect();

    let find = |names: &[&str]| -> Option<usize> {
        cols.iter().position(|c| names.contains(&c.as_str()))
    };

    let ti = find(&["date", "time", "timestamp", "datetime"])
        .ok_or("missing date/time column")?;
    let oi = find(&["open"]).ok_or("missing 'open' column")?;
    let hi = find(&["high"]).ok_or("missing 'high' column")?;
    let li = find(&["low"]).ok_or("missing 'low' column")?;
    let ci = find(&["close", "adj close", "adj_close"]).ok_or("missing 'close' column")?;
    let vi = find(&["volume", "vol"]);

    let mut out = Vec::new();
    for (n, line) in lines.enumerate() {
        let fields = split_row(line);
        let max_idx = [ti, oi, hi, li, ci].iter().copied().max().unwrap();
        if fields.len() <= max_idx {
            return Err(format!("row {} has too few columns", n + 2));
        }
        let time = parse_time(fields[ti].trim())
            .ok_or_else(|| format!("row {}: invalid date '{}'", n + 2, fields[ti].trim()))?;
        let parse_f = |idx: usize, name: &str| -> Result<f64, String> {
            fields[idx]
                .trim()
                .parse::<f64>()
                .map_err(|_| format!("row {}: invalid {} '{}'", n + 2, name, fields[idx].trim()))
        };
        let volume = match vi {
            Some(idx) if idx < fields.len() => fields[idx].trim().parse::<f64>().unwrap_or(0.0),
            _ => 0.0,
        };
        out.push(Candle {
            time,
            open: parse_f(oi, "open")?,
            high: parse_f(hi, "high")?,
            low: parse_f(li, "low")?,
            close: parse_f(ci, "close")?,
            volume,
        });
    }

    if out.is_empty() {
        return Err("no data rows found".into());
    }
    out.sort_by_key(|c| c.time);
    Ok(out)
}

/// Splits a CSV row, handling simple double-quoted fields.
fn split_row(row: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    for ch in row.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => {
                fields.push(std::mem::take(&mut cur));
            }
            _ => cur.push(ch),
        }
    }
    fields.push(cur);
    fields
}

/// Parses a timestamp into UNIX seconds. Accepts a raw integer (seconds or
/// milliseconds), `YYYY-MM-DD`, or `YYYY-MM-DD[ T]HH:MM:SS`.
fn parse_time(s: &str) -> Option<i64> {
    // Raw numeric timestamp.
    if let Ok(n) = s.parse::<i64>() {
        // Heuristic: treat very large values as milliseconds.
        return Some(if n > 10_000_000_000 { n / 1000 } else { n });
    }

    let (date_part, time_part) = if let Some(idx) = s.find(['T', ' ']) {
        (&s[..idx], Some(&s[idx + 1..]))
    } else {
        (s, None)
    };

    let mut dp = date_part.split('-');
    let year: i64 = dp.next()?.parse().ok()?;
    let month: i64 = dp.next()?.parse().ok()?;
    let day: i64 = dp.next()?.parse().ok()?;

    let (mut hh, mut mm, mut ss) = (0i64, 0i64, 0i64);
    if let Some(tp) = time_part {
        let mut tps = tp.split(':');
        hh = tps.next().and_then(|v| v.parse().ok()).unwrap_or(0);
        mm = tps.next().and_then(|v| v.parse().ok()).unwrap_or(0);
        ss = tps
            .next()
            .map(|v| v.split('.').next().unwrap_or("0"))
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
    }

    Some(days_from_civil(year, month, day) * 86_400 + hh * 3600 + mm * 60 + ss)
}

/// Days since the UNIX epoch for a civil (proleptic Gregorian) date.
/// Algorithm from Howard Hinnant's `chrono`-compatible date routines.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_csv() {
        let csv = "Date,Open,High,Low,Close,Volume\n\
                   2024-01-02,100,105,99,104,1000\n\
                   2024-01-03,104,106,103,105,1200\n";
        let candles = parse_csv(csv).unwrap();
        assert_eq!(candles.len(), 2);
        assert_eq!(candles[0].close, 104.0);
        assert_eq!(candles[1].volume, 1200.0);
    }

    #[test]
    fn epoch_is_zero() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
    }

    #[test]
    fn rejects_missing_close() {
        let csv = "Date,Open,High,Low\n2024-01-02,1,2,0\n";
        assert!(parse_csv(csv).is_err());
    }
}

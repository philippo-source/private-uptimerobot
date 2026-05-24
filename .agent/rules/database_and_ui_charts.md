# Database & Chart UI Learnings

This document contains learnings and guidelines from fixing data visualization bugs and API bottlenecks in the uptime monitoring system.

## 1. Sparkline UI & Tooltip Visibility
- **Overflow & Clipping:** Do not use `overflow: hidden` on container components (such as `.sparkline`) if they contain elements like hover tooltips that are absolutely positioned to float outside the container boundary. Doing so will clip and hide the tooltips.
- **Sparkline Spacing & Grid Layout:** 
  - To prevent sparklines from overlapping with text elements (such as uptime percentage), ensure the column layout in the grid has enough dedicated width.
  - A sparkline of 24 bars of `4px` width plus 23 gaps of `3px` width equals `165px`. The grid column must be sized to at least `200px` (or via CSS variables/flex-shrink) to prevent clipping.
- **Flex Stretching for Column Layouts:** If individual bars are wrapped inside column flex containers alongside labels (e.g. hourly labels at the bottom, bars on top), avoid using `align-items: flex-end` on the main wrapper. This collapses the columns to the minimum height of the text labels, leaving the bars (with `flex: 1`) with `0` height. Instead, use `align-items: stretch` on the wrapper to force columns to occupy the full wrapper height, letting the bars dynamically fill the remaining vertical space beautifully.


## 2. Rolling 24-Hour Time Windows
- **Rolling vs. Calendar-Day Buckets:** When plotting a "Last 24 Hours" chart, do not group checks by calendar hour indexes (0–23 of the current day) as it will reset at midnight.
- **Calculation Formula:** Generate the 24 hourly buckets dynamically using rolling offsets from `Date.now()`:
  ```javascript
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const start = new Date(now - (24 - index) * hourMs);
  const end = new Date(now - (23 - index) * hourMs);
  ```
  This guarantees that the chart always shows the exact preceding 24-hour window from the current moment, regardless of the time of day.

## 3. Database Cap & Bucket Size Bottlenecks
- **MongoDB Check Limits:** When fetching lists of monitors and their recent checks, ensure no arbitrary caps restrict the time-series history needed to render the sparkline.
  - *Bug scenario:* The store capped the recent checks array (`bucket.length < 96`). In active systems where monitors are polled once a minute, 96 checks only represent the oldest 1.5 hours of a rolling 24-hour period. This left the remaining 22.5 hours of the dashboard chart empty ("No checks").
  - *Solution:* Remove limits that cap the array length early in the time range query. Ensure that the database query retrieves the full scope (e.g., up to 1440–1500 checks per monitor for a 24-hour window with 1-minute polling).
- **Postgres Store Scaling:** In the Postgres backend, ensure the subquery for recent checks is sized appropriately (e.g., `LIMIT 1500` instead of a small number like `LIMIT 96`) to hold a full day of high-frequency checks.

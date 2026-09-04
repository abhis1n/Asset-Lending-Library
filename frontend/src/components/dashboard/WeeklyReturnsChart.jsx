import React, { useState } from 'react';

/**
 * WeeklyReturnsChart Component
 *
 * Renders an accessible, responsive SVG column chart displaying items returned
 * per week over the last 8 weeks (current week and previous 7 weeks).
 *
 * Requirements satisfied:
 * - X-axis = week.
 * - Y-axis = number of items returned.
 * - Exactly 8 weekly data points.
 * - Include the current week and previous 7 weeks.
 * - Weeks with no returns appear with count '0'.
 * - Dynamic data from API (no hardcoded chart values).
 * - Responsive layout and accessible markup.
 */
export function WeeklyReturnsChart({ weeklyReturns = [] }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Ensure exactly 8 items (or fallback to empty defaults if data is loading)
  const data = Array.isArray(weeklyReturns) && weeklyReturns.length === 8
    ? weeklyReturns
    : Array.from({ length: 8 }, (_, i) => ({
        label: `W${i + 1}`,
        count: 0,
        isCurrentWeek: i === 7,
      }));

  const totalReturns = data.reduce((sum, item) => sum + (item.count || 0), 0);
  const currentWeekReturns = data[data.length - 1]?.count || 0;

  // Chart dimensions & layout coordinates
  const svgWidth = 640;
  const svgHeight = 230;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 32;
  const paddingBottom = 48;

  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  // Dynamic Y-axis scale (minimum 4 so chart has clear vertical breathing room)
  const rawMax = Math.max(...data.map((d) => d.count || 0));
  const yMax = Math.max(4, Math.ceil(rawMax * 1.15));

  // Determine tick intervals (e.g., 4 ticks)
  const yTicks = [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5), Math.round(yMax * 0.75), yMax];
  // Deduplicate and sort ticks
  const uniqueYTicks = [...new Set(yTicks)].sort((a, b) => a - b);

  const slotWidth = plotWidth / data.length;
  const barWidth = Math.min(36, slotWidth * 0.58);

  const activeItem = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="card weekly-chart-card" aria-labelledby="weekly-returns-heading">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div>
          <h2 id="weekly-returns-heading" className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📈</span>
            <span>Items Returned Per Week (Last 8 Weeks)</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Tracking equipment check-in volume across the current week and previous 7 weeks
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge" style={{ backgroundColor: 'var(--primary-50)', color: 'var(--primary-700)', fontWeight: '600' }}>
            8-Week Total: <strong>{totalReturns}</strong> {totalReturns === 1 ? 'item' : 'items'}
          </span>
          <span className="badge" style={{ backgroundColor: '#ecfdf5', color: 'var(--success-600)', fontWeight: '600' }}>
            This Week: <strong>{currentWeekReturns}</strong>
          </span>
        </div>
      </div>

      {/* Interactive Tooltip Callout */}
      <div
        className="chart-tooltip-indicator"
        style={{
          minHeight: '26px',
          fontSize: '0.85rem',
          color: activeItem ? 'var(--text-main)' : 'var(--text-muted)',
          padding: '0.25rem 0.5rem',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
        aria-live="polite"
      >
        {activeItem ? (
          <>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary-600)' }} />
            <strong>Week of {activeItem.label}:</strong>
            <span>{activeItem.count} {activeItem.count === 1 ? 'item returned' : 'items returned'}</span>
            {activeItem.isCurrentWeek && (
              <span className="badge badge-sm" style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-700)', fontSize: '0.75rem' }}>
                Current Week
              </span>
            )}
          </>
        ) : (
          <span style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>
            Hover or tap any weekly column below for exact return metrics
          </span>
        )}
      </div>

      {/* SVG Chart */}
      <div className="chart-svg-container" style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="weekly-returns-svg"
          role="img"
          aria-label={`Bar chart of items returned per week over the last 8 weeks. Total returned: ${totalReturns}.`}
          style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '280px' }}
        >
          <defs>
            <linearGradient id="barGradientRegular" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient id="barGradientCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="barGradientHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#4338ca" />
            </linearGradient>
          </defs>

          {/* Y-Axis Label */}
          <text
            x={14}
            y={paddingTop - 12}
            fill="var(--text-muted)"
            fontSize="10"
            fontWeight="600"
            textAnchor="start"
          >
            ITEMS
          </text>

          {/* Horizontal Gridlines & Y-Axis Ticks */}
          {uniqueYTicks.map((tickVal) => {
            const yPos = paddingTop + plotHeight - (tickVal / yMax) * plotHeight;
            return (
              <g key={`y-tick-${tickVal}`} className="grid-line-group">
                <line
                  x1={paddingLeft}
                  y1={yPos}
                  x2={paddingLeft + plotWidth}
                  y2={yPos}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray={tickVal === 0 ? 'none' : '3 3'}
                />
                <text
                  x={paddingLeft - 8}
                  y={yPos + 3.5}
                  fill="#64748b"
                  fontSize="11"
                  textAnchor="end"
                  fontFamily="var(--font-sans)"
                >
                  {tickVal}
                </text>
              </g>
            );
          })}

          {/* Columns & Data Points for each of the 8 weeks */}
          {data.map((item, index) => {
            const isHovered = hoveredIndex === index;
            const centerX = paddingLeft + index * slotWidth + slotWidth / 2;
            const barX = centerX - barWidth / 2;
            const count = item.count || 0;
            const barHeight = (count / yMax) * plotHeight;
            const barY = paddingTop + plotHeight - barHeight;
            const isZero = count === 0;

            // Fill color depending on current week or regular
            const fillColor = isHovered
              ? 'url(#barGradientHover)'
              : item.isCurrentWeek
              ? 'url(#barGradientCurrent)'
              : 'url(#barGradientRegular)';

            return (
              <g
                key={`col-${item.weekStart || index}`}
                className="chart-column-group"
                tabIndex="0"
                role="button"
                aria-label={`Week of ${item.label}: ${count} items returned ${item.isCurrentWeek ? '(Current Week)' : ''}`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer', outline: 'none' }}
              >
                {/* Transparent hit area for easy hover/tap */}
                <rect
                  x={paddingLeft + index * slotWidth}
                  y={paddingTop - 10}
                  width={slotWidth}
                  height={plotHeight + 20}
                  fill="transparent"
                />

                {/* Column Bar */}
                {isZero ? (
                  // Zero return baseline indicator bar
                  <rect
                    x={barX}
                    y={paddingTop + plotHeight - 3}
                    width={barWidth}
                    height="3"
                    rx="1.5"
                    fill="#cbd5e1"
                    opacity={isHovered ? 1 : 0.75}
                  />
                ) : (
                  // Bar with value
                  <rect
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={barHeight}
                    rx="4"
                    fill={fillColor}
                    filter={isHovered ? 'drop-shadow(0 4px 6px rgba(79, 70, 229, 0.3))' : 'none'}
                    style={{ transition: 'all 0.15s ease' }}
                  />
                )}

                {/* Numeric Value Label above bar */}
                <text
                  x={centerX}
                  y={isZero ? paddingTop + plotHeight - 8 : barY - 6}
                  fill={isZero ? '#94a3b8' : isHovered ? 'var(--primary-700)' : '#1e293b'}
                  fontSize={isHovered ? '13' : '11'}
                  fontWeight={isZero ? '500' : '700'}
                  textAnchor="middle"
                  fontFamily="var(--font-sans)"
                >
                  {count}
                </text>

                {/* X-Axis Week Label */}
                <text
                  x={centerX}
                  y={paddingTop + plotHeight + 18}
                  fill={isHovered ? 'var(--primary-600)' : item.isCurrentWeek ? 'var(--text-main)' : '#64748b'}
                  fontSize="11"
                  fontWeight={item.isCurrentWeek || isHovered ? '700' : '500'}
                  textAnchor="middle"
                  fontFamily="var(--font-sans)"
                >
                  {item.label}
                </text>

                {/* Current Week Sublabel Indicator */}
                {item.isCurrentWeek && (
                  <text
                    x={centerX}
                    y={paddingTop + plotHeight + 31}
                    fill="var(--success-600)"
                    fontSize="9.5"
                    fontWeight="700"
                    textAnchor="middle"
                    fontFamily="var(--font-sans)"
                  >
                    Current
                  </text>
                )}
              </g>
            );
          })}

          {/* Baseline X-Axis */}
          <line
            x1={paddingLeft}
            y1={paddingTop + plotHeight}
            x2={paddingLeft + plotWidth}
            y2={paddingTop + plotHeight}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  );
}

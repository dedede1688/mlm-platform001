'use client'

import React from 'react'
import Link from 'next/link'

export interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  highlight?: boolean
  delta?: number
  deltaLabel?: string
  onClick?: () => void
}

export function MetricCard({ icon, label, value, color, highlight, delta, deltaLabel, onClick }: MetricCardProps) {
  const [textColor, bgColor] = color.split(' ')
  const deltaColor = delta === undefined || delta === 0
    ? 'text-gray-400'
    : delta > 0
    ? 'text-green-600'
    : 'text-red-600'
  const deltaArrow = delta === undefined || delta === 0
    ? '\u2192'
    : delta > 0
    ? '\u2191'
    : '\u2193'
  return (
    <div className={`bg-white rounded-xl shadow-lg p-5 flex items-center gap-4 hover:shadow-xl transition-shadow ${
      highlight ? 'ring-2 ring-red-300 cursor-pointer' : ''
    } ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor} ${textColor}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {delta !== undefined && (
            <span className={`text-xs font-semibold ${deltaColor} whitespace-nowrap`} title={deltaLabel}>
              {deltaArrow} {Math.abs(delta)}%{deltaLabel && <span className="text-gray-400 font-normal ml-1">{deltaLabel}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- ReportItem (daily report card) ----

export function ReportItem({ icon, label, value, delta, deltaLabel }: {
  icon: React.ReactNode
  label: string
  value: string
  delta?: number
  deltaLabel?: string
}) {
  const deltaColor = delta === undefined || delta === 0
    ? 'text-gray-400'
    : delta > 0
    ? 'text-green-600'
    : 'text-red-600'
  const deltaArrow = delta === undefined || delta === 0
    ? ''
    : delta > 0
    ? '\u2191'
    : '\u2193'
  return (
    <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-base font-bold text-gray-900">{value}</p>
        {delta !== undefined && (
          <span className={`text-xs font-semibold ${deltaColor}`} title={deltaLabel}>
            {deltaArrow} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  )
}

// ---- PendingItem (exception card with drill-down link) ----

export function PendingItem({ icon, label, count, href, color }: {
  icon: React.ReactNode
  label: string
  count: number
  href: string
  color: string
}) {
  const [textColor, bgColor] = color.split(' ')
  const hasCount = count > 0
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
        hasCount
          ? 'bg-white/80 border-orange-200 hover:bg-white hover:border-orange-300'
          : 'bg-white/40 border-gray-100 hover:bg-white/60'
      }`}
    >
      <div className={`w-8 h-8 rounded flex items-center justify-center ${bgColor} ${textColor}`}>
        {icon}
      </div>
      <span className={`flex-1 text-sm ${hasCount ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
        {label}
      </span>
      {hasCount ? (
        <span className="text-lg font-bold text-red-600">{count}</span>
      ) : (
        <span className="text-lg font-bold text-gray-300">0</span>
      )}
    </Link>
  )
}

"use client";

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const ACTIVITY_BAR_COLORS: Record<string, string> = {
  Call:           "#22c55e",
  Email:          "#3b82f6",
  Meeting:        "#a855f7",
  Note:           "#9ca3af",
  Task:           "#f97316",
  "Text Message": "#06b6d4",
};

const REP_LINE_COLORS = ["#16a34a", "#6366f1", "#f59e0b", "#ef4444", "#0ea5e9", "#ec4899"];

interface SalesRep {
  clerkUserId: string;
  displayName: string;
}

interface WeeklyDataPoint {
  week: string;
  Call: number;
  Email: number;
  Meeting: number;
  Note: number;
  Task: number;
  "Text Message": number;
}

interface Props {
  weeklyActivityData: WeeklyDataPoint[];
  dailyRepData: Array<Record<string, string | number>>;
  activitiesLoading: boolean;
  salesReps: SalesRep[];
}

export default function CRMActivityCharts({ weeklyActivityData, dailyRepData, activitiesLoading, salesReps }: Props) {
  if (activitiesLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
        Loading activity data…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: 10-week stacked bar by type */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-800 mb-0.5">Weekly Volume by Type</p>
        <p className="text-xs text-gray-400 mb-4">Last 10 weeks</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeklyActivityData} barSize={18} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
              cursor={{ fill: "#f9fafb" }}
            />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {(["Call", "Email", "Meeting", "Note", "Task", "Text Message"] as const).map(type => (
              <Bar key={type} dataKey={type} stackId="a" fill={ACTIVITY_BAR_COLORS[type]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Right: last 10 work days per-rep line chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-800 mb-0.5">Daily Activity by Rep</p>
        <p className="text-xs text-gray-400 mb-4">Last 10 work days (Mon–Fri)</p>
        {salesReps.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No sales reps found</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyRepData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
              />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {salesReps.map((rep, i) => (
                <Line
                  key={rep.clerkUserId}
                  type="monotone"
                  dataKey={rep.clerkUserId}
                  name={rep.displayName}
                  stroke={REP_LINE_COLORS[i % REP_LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

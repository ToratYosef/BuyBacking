"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { fetchSummary, fetchTimeseries, fetchTop, fetchLive } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, windowOptions } from "@/lib/utils";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";

interface SummaryResponse {
  pageviews: number;
  unique_users: number;
  active_users_now: number;
  top_paths: Array<{ path: string; views: number; uniques: number }>;
}

interface TimeseriesResponse {
  buckets: Array<{ t: string; views: number; uniques: number }>;
  granularity: string;
}

interface TopResponse {
  paths: Array<{ path: string; views: number; uniques: number }>;
}

interface LiveResponse {
  buckets: Array<{ t?: string; views: number; uniques: number }>;
  active_users_now: number;
}

const DEFAULT_SITE = "default";

export default function AdminPage() {
  const auth = getFirebaseAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [windowSize, setWindowSize] = useState("24h");
  const [granularity, setGranularity] = useState<string | undefined>(undefined);
  const [pathFilter, setPathFilter] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.replace("/login");
      } else {
        setAuthChecked(true);
      }
    });
    return () => unsub();
  }, [auth, router]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["summary", windowSize, pathFilter] });
      queryClient.invalidateQueries({ queryKey: ["timeseries", windowSize, granularity, pathFilter] });
      queryClient.invalidateQueries({ queryKey: ["top", windowSize, pathFilter] });
      queryClient.invalidateQueries({ queryKey: ["live", windowSize, pathFilter] });
    }, Math.min(30000, windowSize.endsWith("m") ? 10000 : 30000));
    return () => clearInterval(interval);
  }, [autoRefresh, queryClient, windowSize, granularity, pathFilter]);

  const summaryQuery = useQuery<SummaryResponse>({
    queryKey: ["summary", windowSize, pathFilter],
    enabled: authChecked,
    queryFn: () => fetchSummary({ siteId: DEFAULT_SITE, window: windowSize, path: pathFilter || undefined }),
  });

  const timeseriesQuery = useQuery<TimeseriesResponse>({
    queryKey: ["timeseries", windowSize, granularity, pathFilter],
    enabled: authChecked,
    queryFn: () => fetchTimeseries({ siteId: DEFAULT_SITE, window: windowSize, granularity, path: pathFilter || undefined }),
  });

  const topQuery = useQuery<TopResponse>({
    queryKey: ["top", windowSize, pathFilter],
    enabled: authChecked,
    queryFn: () => fetchTop({ siteId: DEFAULT_SITE, window: windowSize, path: pathFilter || undefined, limit: 20 }),
  });

  const liveQuery = useQuery<LiveResponse>({
    queryKey: ["live", windowSize, pathFilter],
    enabled: authChecked,
    queryFn: () => fetchLive({ siteId: DEFAULT_SITE, window: windowSize, path: pathFilter || undefined }),
  });

  const avgViews = useMemo(() => {
    if (!summaryQuery.data) return 0;
    return summaryQuery.data.unique_users ? summaryQuery.data.pageviews / summaryQuery.data.unique_users : 0;
  }, [summaryQuery.data]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-12 w-12" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground">Monitor engagement and usage in real time.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Auto refresh
            </label>
            <Button
              variant="outline"
              onClick={async () => {
                await auth.signOut();
                router.replace("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6">
        <section className="flex flex-wrap gap-4">
          <div className="flex gap-2">
            {windowOptions().map((option) => (
              <Button
                key={option.value}
                variant={option.value === windowSize ? "default" : "outline"}
                onClick={() => setWindowSize(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="granularity">
              Granularity
            </label>
            <select
              id="granularity"
              value={granularity ?? "auto"}
              onChange={(event) => setGranularity(event.target.value === "auto" ? undefined : event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="auto">Auto</option>
              <option value="minute">Minute</option>
              <option value="hour">Hour</option>
              <option value="day">Day</option>
            </select>
            <label className="text-sm text-muted-foreground" htmlFor="pathFilter">
              Path
            </label>
            <input
              id="pathFilter"
              value={pathFilter}
              onChange={(event) => setPathFilter(event.target.value)}
              placeholder="/pricing"
              className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>Pageviews</CardDescription>
              <CardTitle className="text-3xl">
                {summaryQuery.isLoading ? <Skeleton className="h-8 w-24" /> : formatNumber(summaryQuery.data?.pageviews ?? 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Unique visitors</CardDescription>
              <CardTitle className="text-3xl">
                {summaryQuery.isLoading ? <Skeleton className="h-8 w-24" /> : formatNumber(summaryQuery.data?.unique_users ?? 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Active now</CardDescription>
              <CardTitle className="text-3xl">
                {liveQuery.isLoading ? <Skeleton className="h-8 w-24" /> : formatNumber(liveQuery.data?.active_users_now ?? 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Avg views per user</CardDescription>
              <CardTitle className="text-3xl">
                {summaryQuery.isLoading ? <Skeleton className="h-8 w-24" /> : avgViews.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="h-[420px]">
            <CardHeader>
              <CardTitle>Traffic over time</CardTitle>
              <CardDescription>
                {timeseriesQuery.data?.granularity ?? "minute"} buckets for {windowSize} window
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {timeseriesQuery.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseriesQuery.data?.buckets ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="t" hide />
                    <YAxis width={60} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="views" stroke="#2563eb" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="uniques" stroke="#16a34a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card className="h-[420px]">
            <CardHeader>
              <CardTitle>Live minute buckets</CardTitle>
              <CardDescription>Recent activity</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {liveQuery.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={liveQuery.data?.buckets ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="t" hide />
                    <YAxis width={60} />
                    <Tooltip />
                    <Bar dataKey="views" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Top pages</CardTitle>
              <CardDescription>Most visited paths in the selected window</CardDescription>
            </CardHeader>
            <CardContent>
              {topQuery.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Path</th>
                        <th className="px-4 py-2 text-right font-medium">Views</th>
                        <th className="px-4 py-2 text-right font-medium">Uniques</th>
                        <th className="px-4 py-2 text-right font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(topQuery.data?.paths ?? []).map((item) => {
                        const share = summaryQuery.data?.pageviews
                          ? ((item.views / summaryQuery.data.pageviews) * 100).toFixed(1)
                          : "0.0";
                        return (
                          <tr key={item.path} className="border-b last:border-none">
                            <td className="px-4 py-2 font-medium">{item.path}</td>
                            <td className="px-4 py-2 text-right">{formatNumber(item.views)}</td>
                            <td className="px-4 py-2 text-right">{formatNumber(item.uniques)}</td>
                            <td className="px-4 py-2 text-right">{share}%</td>
                          </tr>
                        );
                      })}
                      {topQuery.data?.paths?.length ? null : (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                            No traffic yet for this window.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

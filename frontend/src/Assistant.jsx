import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import Avatar from "./components/ui/Avatar";
import Badge from "./components/ui/Badge";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import PageHeader from "./components/ui/PageHeader";
import Spinner from "./components/ui/Spinner";
import { Field, Select } from "./components/ui/Field";
import { useToast } from "./components/Toast";
import {
    AlertIcon,
    CheckCircleIcon,
    CopyIcon,
    InfoIcon,
    MessageCircleIcon,
    RefreshCwIcon,
    SparklesIcon,
    TrendUpIcon,
    HouseIcon,
} from "./components/Icons";
import { errorMessage } from "./utils/format";

function GroupPicker({ groups, selectedGroupId, onChange }) {
    if (groups.length === 0) {
        return (
            <Card className="p-5">
                <EmptyState
                    compact
                    icon={<HouseIcon className="h-6 w-6" />}
                    title="You're not in a living group yet"
                    description="Join or create a living group first — the conflict assistant analyzes your group's data to spot friction."
                />
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <Field label="Living group">
                <Select
                    value={selectedGroupId || ""}
                    onChange={(e) =>
                        onChange(e.target.value ? Number(e.target.value) : null)
                    }
                >
                    <option value="">Select a group</option>
                    {groups.map((group) => (
                        <option key={group.group_id} value={group.group_id}>
                            {group.name} ({group.member_count} members)
                        </option>
                    ))}
                </Select>
            </Field>
        </Card>
    );
}

function healthColor(score) {
    if (score >= 85) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-rose-500";
}

function healthLabel(score) {
    if (score >= 85) return "Healthy";
    if (score >= 60) return "Needs attention";
    return "At risk";
}

const SEVERITY_STYLES = {
    high: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 border-rose-200",
    medium: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-200",
    low: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-200",
};

const TYPE_LABELS = {
    payment: "Payments",
    chore: "Chores",
    violation: "Rules",
    debt: "Balances",
};

function ConflictCard({ conflict, onCopy }) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        onCopy(conflict.message);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${SEVERITY_STYLES[conflict.severity] || SEVERITY_STYLES.low}`}>
                        {conflict.severity}
                    </span>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                        {TYPE_LABELS[conflict.type] || conflict.type}
                    </span>
                </div>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{conflict.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{conflict.detail}</p>

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50 dark:bg-brand-500/25 p-3">
                <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                <p className="text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-brand-700 dark:text-brand-300">Suggested fix: </span>
                    {conflict.suggestion}
                </p>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
                    <MessageCircleIcon className="h-3.5 w-3.5" />
                    Draft message to send
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{conflict.message}</p>
            </div>

            <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={copy}
            >
                <CopyIcon className="h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy message"}
            </Button>
        </Card>
    );
}

function Assistant() {
    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [analysisError, setAnalysisError] = useState(false);
const [section, setSection] = useState("health");
    const toast = useToast();
    const analysisRequestRef = useRef(0);

    const loadGroups = useCallback(async () => {
        const res = await api.get("/groups/");
        const myGroups = (res.data.groups || []).filter((g) => g.status === "active");
        setGroups(myGroups);
        return myGroups;
    }, []);

    const loadAnalysis = useCallback(async (groupId, showSpinner = false) => {
        if (!groupId) {
            setAnalysis(null);
            return;
        }
        const requestId = ++analysisRequestRef.current;
        try {
            if (showSpinner) setLoadingAnalysis(true);
            setAnalysisError(false);
            const res = await api.get("/assistant/analysis", { params: { group_id: groupId } });
            if (analysisRequestRef.current !== requestId) return;
            setAnalysis(res.data);
        } catch (error) {
            if (analysisRequestRef.current !== requestId) return;
            setAnalysisError(true);
            toast.error(errorMessage(error, "Could not analyze group"));
        } finally {
            if (showSpinner && analysisRequestRef.current === requestId) setLoadingAnalysis(false);
        }
    }, [toast]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const myGroups = await loadGroups();
                if (myGroups.length > 0) {
                    const firstId = myGroups[0].group_id;
                    if (active) setSelectedGroupId(firstId);
                    await loadAnalysis(firstId);
                }
            } catch (error) {
                console.error(error);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [loadGroups, loadAnalysis]);

    const selectGroup = async (groupId) => {
        setSelectedGroupId(groupId);
        setAnalysis(null);
        setAnalysisError(false);
        if (!groupId) return;
        await loadAnalysis(groupId, true);
    };

    const copyMessage = (text) => {
        (navigator.clipboard?.writeText(text) || Promise.reject())
            .then(() => toast.success("Message copied to clipboard"))
            .catch(() => toast.error("Could not copy message"));
    };

    if (loading) {
        return (
            <div className="w-full max-w-5xl mx-auto">
                <PageHeader title="Conflict Assistant" subtitle="A rule-based assistant that reads your group's expenses, chores, rules and reliability scores to spot friction and suggest next steps." />
                <div className="flex justify-center py-24">
                    <Spinner size="lg" />
                </div>
            </div>
        );
    }

    const selectedGroup = groups.find((g) => g.group_id === selectedGroupId) || null;

    return (
        <div className="w-full max-w-5xl mx-auto">
            <PageHeader
                title="Conflict Assistant"
                subtitle="A rule-based assistant that reads your group's expenses, chores, rules and reliability scores to spot friction and suggest next steps."
            />

            <div className="mb-6">
                        <GroupPicker groups={groups} selectedGroupId={selectedGroupId} onChange={selectGroup} />

                        {/* Section tabs */}
                        <div className="mb-5 flex gap-1.5 overflow-x-auto no-scrollbar touch-scroll scroll-smooth rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-1 shadow-card">
                            {[
                                { key: "health", label: "Health" },
                                { key: "conflicts", label: `Conflicts${analysis ? ` (${analysis.conflicts.length})` : ""}` },
                                { key: "insights", label: "Insights" },
                            ].map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setSection(t.key)}
                                    className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3.5 py-2 min-h-[42px] text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                                        section === t.key
                                            ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"
                                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
            </div>

            {selectedGroup && analysis ? (
                <>
                    {loadingAnalysis ? (
                        <div className="flex justify-center py-16">
                            <Spinner size="lg" />
                        </div>
                    ) : (
                        <>
                            {/* Overall health */}
                            {section === "health" && (
                            <Card className="mb-6 overflow-hidden">
                                <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
                                    <div className="flex shrink-0 items-center gap-4">
                                        <div className="relative flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
                                            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90 sm:h-24 sm:w-24">
                                                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-slate-100" />
                                                <circle
                                                    cx="18"
                                                    cy="18"
                                                    r="15.5"
                                                    fill="none"
                                                    strokeWidth="3.5"
                                                    strokeLinecap="round"
                                                    strokeDasharray={`${analysis.overall.health_score} 100`}
                                                    className={healthColor(analysis.overall.health_score)}
                                                />
                                            </svg>
                                            <div className="absolute text-center">
                                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                                                    {analysis.overall.health_score}
                                                </p>
                                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                    health
                                                </p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="flex items-center gap-2 text-sm font-medium text-slate-400 dark:text-slate-500">
                                                {analysis.group_name}
                                            </p>
                                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                                {healthLabel(analysis.overall.health_score)}
                                            </h3>
                                            <p className="mt-1 max-w-md text-sm text-slate-500">
                                                {analysis.overall.summary}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                                        {[
                                            { label: "Overdue payments", value: analysis.overall.counts.overdue_shares, icon: <TrendUpIcon className="h-4 w-4" /> },
                                            { label: "Overdue chores", value: analysis.overall.counts.overdue_chores, icon: <CheckCircleIcon className="h-4 w-4" /> },
                                            { label: "Violations (90d)", value: analysis.overall.counts.violations, icon: <AlertIcon className="h-4 w-4" /> },
                                            { label: "Large balances", value: analysis.overall.counts.high_debts, icon: <InfoIcon className="h-4 w-4" /> },
                                        ].map((stat) => (
                                            <div key={stat.label} className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
                                                <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                                    {stat.icon}
                                                    <span className="text-xs">{stat.label}</span>
                                                </div>
                                                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{stat.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                            )}

                            {section === "conflicts" && (
                            <>
                            {/* Conflicts */}
                            <div className="mb-5 flex items-center justify-between">
                                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                                    <AlertIcon className="h-4 w-4 text-brand-500" />
                                    Flags ({analysis.conflicts.length})
                                </h2>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => loadAnalysis(selectedGroupId, true)}
                                >
                                    <RefreshCwIcon className="h-4 w-4" />
                                    Re-analyze
                                </Button>
                            </div>

                            {analysis.conflicts.length === 0 ? (
                                <Card className="p-5">
                                    <EmptyState
                                        compact
                                        icon={<CheckCircleIcon className="h-6 w-6" />}
                                        title="No conflicts detected"
                                        description="Nothing needs attention right now. Keep the good rhythm going!"
                                    />
                                </Card>
                            ) : (
                                <div className="space-y-4">
                                    {analysis.conflicts.map((conflict, i) => (
                                        <ConflictCard
                                            key={`${conflict.type}-${i}`}
                                            conflict={conflict}
                                            onCopy={copyMessage}
                                        />
                                    ))}
                                </div>
                            )}
                            </>
                            )}

                            {section === "insights" && (
                            <div className="grid gap-5 lg:grid-cols-2">
                                {/* Suggestions */}
                                <Card className="p-5">
                                    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                                        <SparklesIcon className="h-4 w-4 text-brand-500" />
                                        Proactive suggestions
                                    </h2>
                                    <div className="space-y-3">
                                        {analysis.suggestions.map((s, i) => (
                                            <div key={i} className="rounded-xl border border-brand-100 bg-brand-50 dark:bg-brand-500/15 p-3">
                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{s.title}</p>
                                                <p className="mt-0.5 text-sm text-slate-500">{s.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                </Card>

                                {/* Highlights */}
                                <Card className="p-5">
                                    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                                        <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                                        What's going well
                                    </h2>
                                    {analysis.highlights.length === 0 ? (
                                        <p className="text-sm text-slate-400 dark:text-slate-500">
                                            Not much to highlight yet — start settling up and completing chores to build momentum.
                                        </p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {analysis.highlights.map((h, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                                                    {h}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </Card>
                            </div>
                            )}

                            {/* Member snapshot */}
                            {section === "health" && (
                            <Card className="p-5">
                                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                                    Member snapshot
                                </h2>
                                <div className="space-y-2">
                                    {analysis.members.map((member) => (
                                        <div key={member.user_id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                                            <Avatar name={member.name} size="sm" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{member.name}</p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                                    {member.net_balance >= 0
                                                        ? `Owed ₹${member.net_balance.toFixed(2)}`
                                                        : `Owes ₹${Math.abs(member.net_balance).toFixed(2)}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-14 sm:w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                                    <div
                                                        className={`h-full rounded-full ${healthColor(member.score)}`}
                                                        style={{ width: `${Math.max(0, Math.min(100, member.score))}%` }}
                                                    />
                                                </div>
                                                <Badge variant={member.score >= 85 ? "success" : member.score >= 60 ? "warning" : "danger"}>
                                                    {member.score}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                            )}
                        </>
                    )}
                </>
            ) : selectedGroup ? (
                analysisError ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <p className="text-sm text-slate-500">Could not load analysis for this group.</p>
                        <Button variant="secondary" size="sm" className="mt-3" onClick={() => loadAnalysis(selectedGroupId, true)}>
                            Retry
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                )
            ) : null}
        </div>
    );
}

export default Assistant;
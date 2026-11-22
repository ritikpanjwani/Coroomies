import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { useToast } from "./components/Toast";
import { errorMessage } from "./utils/format";
import PageHeader from "./components/ui/PageHeader";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";
import Modal from "./components/ui/Modal";
import { Field, Select } from "./components/ui/Field";
import EmptyState from "./components/ui/EmptyState";
import Spinner from "./components/ui/Spinner";
import { BuildingIcon, MapPinIcon, PlusIcon, SearchIcon, UsersRoundIcon, HouseIcon } from "./components/Icons";

const emptyListing = {
    title: "",
    description: "",
    location: "",
    rent: "",
    deposit: "",
    room_type: "Single",
    spots: 1,
    amenities: "",
    available_from: "",
    college: "",
    degree: "",
    stream: "",
    year: "",
    lifestyle_preferences: "",
};

export default function Rooms() {
    const toast = useToast();
    const [tab, setTab] = useState("listings");
    const [listings, setListings] = useState([]);
    const [vacancies, setVacancies] = useState([]);
    const [groups, setGroups] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [candidateGroupId, setCandidateGroupId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [filters, setFilters] = useState({ location: "", max_rent: "", room_type: "" });
    const [listing, setListing] = useState(emptyListing);

    const loadListings = async () => {
        const params = {};
        if (filters.location.trim()) params.location = filters.location.trim();
        if (filters.max_rent) params.max_rent = Number(filters.max_rent);
        if (filters.room_type) params.room_type = filters.room_type;
        const res = await api.get("/listings/", { params });
        setListings(res.data.listings || []);
    };

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [listingsRes, vacanciesRes, groupsRes] = await Promise.all([
                api.get("/listings/", { params: filters.location || filters.max_rent || filters.room_type ? {
                    location: filters.location || undefined,
                    max_rent: filters.max_rent ? Number(filters.max_rent) : undefined,
                    room_type: filters.room_type || undefined,
                } : {} }),
                api.get("/vacancies/"),
                api.get("/groups/"),
            ]);
            setListings(listingsRes.data.listings || []);
            setVacancies(vacanciesRes.data.vacancies || []);
            setGroups((groupsRes.data.groups || []).filter((group) => group.status === "active"));
        } catch (error) {
            toast.error(errorMessage(error, "Could not load rooms"));
        } finally {
            setLoading(false);
        }
    }, [filters.location, filters.max_rent, filters.room_type, toast]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            loadAll();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadAll]);

    const createListing = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            await api.post("/listings/", {
                ...listing,
                rent: Number(listing.rent),
                deposit: listing.deposit ? Number(listing.deposit) : null,
                spots: Number(listing.spots),
                year: listing.year ? Number(listing.year) : null,
            });
            toast.success("Room listing published");
            setListing(emptyListing);
            setShowCreate(false);
            await loadListings();
        } catch (error) {
            toast.error(errorMessage(error, "Could not publish listing"));
        } finally {
            setSaving(false);
        }
    };

    const deleteListing = async (listingId) => {
        if (!window.confirm("Delete this room listing?")) return;
        try {
            await api.delete(`/listings/${listingId}`);
            toast.success("Listing deleted");
            await loadListings();
        } catch (error) {
            toast.error(errorMessage(error, "Could not delete listing"));
        }
    };

    const applyToVacancy = async (groupId) => {
        try {
            await api.post(`/vacancies/${groupId}/apply`);
            toast.success("Application submitted");
            await loadAll();
        } catch (error) {
            toast.error(errorMessage(error, "Could not apply"));
        }
    };

    const setOpenSlots = async (groupId, openSlots) => {
        try {
            await api.put(`/vacancies/${groupId}`, { open_slots: Number(openSlots) });
            toast.success("Vacancy settings updated");
            await loadAll();
        } catch (error) {
            toast.error(errorMessage(error, "Could not update vacancy settings"));
        }
    };

    const loadCandidates = async (groupId) => {
        setCandidateGroupId(groupId);
        try {
            const res = await api.get(`/vacancies/${groupId}/candidates`);
            setCandidates(res.data.candidates || []);
        } catch (error) {
            setCandidates([]);
            toast.error(errorMessage(error, "Candidates are available only to group admins"));
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[300px] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Rooms & Vacancies"
                description="Publish room listings or find an open place in a Living Group"
                actions={
                    <Button onClick={() => setShowCreate(true)}>
                        <PlusIcon className="h-4 w-4" />
                        Publish listing
                    </Button>
                }
            />

            <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
                {[
                    { key: "listings", label: "Room listings" },
                    { key: "vacancies", label: "Living group vacancies" },
                    { key: "manage", label: "Manage" },
                ].map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => setTab(item.key)}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                            tab === item.key
                                ? "bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-brand-300"
                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {tab === "listings" && (
                <div className="space-y-4">
                    <Card className="p-4">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Field label="Location">
                                <input
                                    value={filters.location}
                                    onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                    placeholder="City or area"
                                />
                            </Field>
                            <Field label="Max rent">
                                <input
                                    type="number"
                                    min="0"
                                    value={filters.max_rent}
                                    onChange={(event) => setFilters((current) => ({ ...current, max_rent: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                    placeholder="Monthly rent"
                                />
                            </Field>
                            <Field label="Room type">
                                <Select
                                    value={filters.room_type}
                                    onChange={(event) => setFilters((current) => ({ ...current, room_type: event.target.value }))}
                                >
                                    <option value="">Any</option>
                                    <option value="Single">Single</option>
                                    <option value="Shared">Shared</option>
                                    <option value="Studio">Studio</option>
                                </Select>
                            </Field>
                            <div className="flex items-end">
                                <Button className="w-full" onClick={async () => { await loadListings(); }}>
                                    <SearchIcon className="h-4 w-4" />
                                    Search
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {listings.length === 0 ? (
                        <EmptyState icon={<BuildingIcon className="h-6 w-6" />} title="No room listings" description="Publish the first listing or adjust your search filters." />
                    ) : (
                        <div className="grid gap-4 lg:grid-cols-2">
                            {listings.map((item) => (
                                <Card key={item.id} className="p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{item.title}</h3>
                                            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPinIcon className="h-4 w-4" />{item.location}</p>
                                        </div>
                                        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">₹{item.rent}/mo</span>
                                    </div>
                                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                                        <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{item.room_type}</span>
                                        <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{item.spots} spot(s)</span>
                                        {item.available_from && <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">From {item.available_from}</span>}
                                    </div>
                                    {item.owner_id === Number(localStorage.getItem("user_id")) && (
                                        <Button variant="danger" size="sm" className="mt-4" onClick={() => deleteListing(item.id)}>Delete listing</Button>
                                    )}
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === "vacancies" && (
                vacancies.length === 0 ? (
                    <EmptyState icon={<HouseIcon className="h-6 w-6" />} title="No open vacancies" description="New group openings will appear here." />
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {vacancies.map((item) => (
                            <Card key={item.group_id} className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{item.name}</h3>
                                        <p className="mt-1 text-sm text-slate-500">{item.description || "Living Group"}</p>
                                    </div>
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{item.open_slots} open</span>
                                </div>
                                <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><UsersRoundIcon className="h-4 w-4" />{item.active_members} active member(s)</p>
                                <Button className="mt-4 w-full" onClick={() => applyToVacancy(item.group_id)}>Apply to join</Button>
                            </Card>
                        ))}
                    </div>
                )
            )}

            {tab === "manage" && (
                <div className="grid gap-4 lg:grid-cols-2">
                    {groups.map((group) => (
                        <Card key={group.group_id} className="p-5">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">{group.name}</h3>
                            <p className="mt-1 text-xs text-slate-500">Role: {group.my_role}</p>
                            {group.my_role === "admin" ? (
                                <div className="mt-4 space-y-3">
                                    <Field label="Open vacancies">
                                        <input
                                            type="number"
                                            min="0"
                                            max="20"
                                            defaultValue={group.open_slots || 0}
                                            onBlur={(event) => setOpenSlots(group.group_id, event.target.value)}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                        />
                                    </Field>
                                    <Button variant="secondary" className="w-full" onClick={() => loadCandidates(group.group_id)}>
                                        View ranked candidates
                                    </Button>
                                    {candidateGroupId === group.group_id && (
                                        candidates.length === 0 ? (
                                            <p className="text-xs text-slate-500">No candidates found.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {candidates.map((candidate) => (
                                                    <div key={candidate.user_id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
                                                        <span>{candidate.name}</span>
                                                        <span className="font-bold text-brand-600">{candidate.compatibility}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}
                                </div>
                            ) : (
                                <p className="mt-3 text-xs text-slate-500">Only group admins can manage vacancies.</p>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Publish room listing" maxWidth="max-w-2xl">
                <form onSubmit={createListing} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Title" required><input required value={listing.title} onChange={(e) => setListing({ ...listing, title: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></Field>
                        <Field label="Location" required><input required value={listing.location} onChange={(e) => setListing({ ...listing, location: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></Field>
                        <Field label="Monthly rent" required><input required type="number" min="1" value={listing.rent} onChange={(e) => setListing({ ...listing, rent: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></Field>
                        <Field label="Deposit"><input type="number" min="0" value={listing.deposit} onChange={(e) => setListing({ ...listing, deposit: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></Field>
                        <Field label="Room type"><Select value={listing.room_type} onChange={(e) => setListing({ ...listing, room_type: e.target.value })}><option>Single</option><option>Shared</option><option>Studio</option></Select></Field>
                        <Field label="Available spots"><input type="number" min="1" max="20" value={listing.spots} onChange={(e) => setListing({ ...listing, spots: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></Field>
                        <Field label="Available from" required><input required type="date" value={listing.available_from} onChange={(e) => setListing({ ...listing, available_from: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></Field>
                        <Field label="Amenities"><input value={listing.amenities} onChange={(e) => setListing({ ...listing, amenities: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></Field>
                    </div>
                    <Field label="Description" required><textarea required rows="4" value={listing.description} onChange={(e) => setListing({ ...listing, description: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></Field>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button type="submit" loading={saving}>Publish listing</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

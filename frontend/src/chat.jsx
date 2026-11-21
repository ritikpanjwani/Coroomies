import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import api, { API_BASE } from "./api";
import Avatar from "./components/ui/Avatar";
import Badge from "./components/ui/Badge";
import Button from "./components/ui/Button";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Modal from "./components/ui/Modal";
import Spinner from "./components/ui/Spinner";
import { useToast } from "./components/Toast";
import {
    MessageCircleIcon,
    RefreshCwIcon,
    SearchIcon,
    SendIcon,
    Trash2Icon,
    ArrowLeftIcon,
    UsersRoundIcon,
    XIcon,
    ChevronDownIcon,
    EllipsisVerticalIcon,
    Share2Icon,
    BellIcon,
    BellOffIcon,
    ShieldCheckIcon,
    FlagIcon,
    UserRoundIcon,
    PaperclipIcon,
    ImageIcon,
    VideoIcon,
    DownloadIcon,
    ZoomInIcon,
    ZoomOutIcon,
    CameraIcon,
} from "./components/Icons";
import { formatTime, formatRelativeDay, formatRelativeTime, errorMessage } from "./utils/format";

function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProtectedAttachment({ attachment, isOwn, onExpand }) {
    const [mediaUrl, setMediaUrl] = useState(null);

    useEffect(() => {
        let active = true;
        let objectUrl = null;
        api.get(`/messages/media/${attachment.id}`, { responseType: "blob" })
            .then((response) => {
                objectUrl = URL.createObjectURL(response.data);
                if (active) setMediaUrl(objectUrl);
            })
            .catch(() => active && setMediaUrl(null));
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [attachment.id]);

    if (!mediaUrl) {
        return <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />;
    }

    const isVideo = attachment.media_type === "video" || attachment.mime_type?.startsWith("video/");
    if (isVideo) {
        return (
            <div className="overflow-hidden rounded-xl bg-black/10 dark:bg-black/30">
                <video controls preload="metadata" playsInline className="max-h-72 w-full rounded-xl object-contain bg-black">
                    <source src={mediaUrl} type={attachment.mime_type || "video/mp4"} />
                    Your browser does not support HTML video playback.
                </video>
                {attachment.original_filename && (
                    <div className={`flex items-center justify-between px-2.5 py-1 text-[11px] ${isOwn ? "text-brand-100/80" : "text-slate-400"}`}>
                        <span className="truncate max-w-[180px]">{attachment.original_filename}</span>
                        {attachment.file_size > 0 && <span>{formatFileSize(attachment.file_size)}</span>}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="group/att relative overflow-hidden rounded-xl">
            <img src={mediaUrl} alt={attachment.original_filename || "Shared photo"} loading="lazy" onClick={onExpand} className="max-h-72 w-auto max-w-full rounded-xl object-cover cursor-pointer transition-transform hover:scale-[1.01]" />
            <button type="button" onClick={onExpand} className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 group-hover/att:opacity-100 transition-opacity hover:bg-black/80" title="Expand photo" aria-label="Expand photo">
                <ZoomInIcon className="h-4 w-4" />
            </button>
        </div>
    );
}

const ICEBREAKERS = [
    "Hey! Excited to connect with you!",
    "When are you planning to move in?",
    "What localities are you looking at?",
    "What's your target monthly budget?",
];

function Chat() {
    const [conversations, setConversations] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(() => {
        const stored = localStorage.getItem("user_id");
        return stored ? Number(stored) : null;
    });
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [failedMessage, setFailedMessage] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [mobileView, setMobileView] = useState("list"); // "list" | "chat"
    const [view, setView] = useState("chats"); // "chats" | "requests" | "friends"
    const [friends, setFriends] = useState([]);
    const [loadingFriends, setLoadingFriends] = useState(false);
    const [friendsError, setFriendsError] = useState(null);

    // Media sharing state
    const [selectedMedia, setSelectedMedia] = useState([]);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
    const [lightboxMedia, setLightboxMedia] = useState(null);
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [lightboxZoom, setLightboxZoom] = useState(1);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const fileInputRef = useRef(null);
    const videoInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const attachmentMenuRef = useRef(null);

    // Header 3-dot dropdown menu
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    // Peer profile preview modal
    const [peerProfileModalOpen, setPeerProfileModalOpen] = useState(false);
    const [peerProfile, setPeerProfile] = useState(null);
    const [loadingPeerProfile, setLoadingPeerProfile] = useState(false);

    // Block / Unblock confirmation
    const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
    const [blocking, setBlocking] = useState(false);
    const [unblockConfirmOpen, setUnblockConfirmOpen] = useState(false);
    const [unblocking, setUnblocking] = useState(false);

    // Report user modal
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportReason, setReportReason] = useState("Inappropriate behavior");
    const [reportDetails, setReportDetails] = useState("");
    const [reporting, setReporting] = useState(false);

    // Clear conversation confirmation
    const [clearChatConfirmOpen, setClearChatConfirmOpen] = useState(false);
    const [clearingChat, setClearingChat] = useState(false);

    // Scroll tracking
    const messagesRef = useRef(null);
    const isNearBottomRef = useRef(true);
    const lastPeerIdRef = useRef(null);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const toast = useToast();

    // Verify current user
    useEffect(() => {
        api.get("/auth/me")
            .then((res) => {
                if (res.data?.user_id) setCurrentUserId(res.data.user_id);
            })
            .catch(() => null);
    }, []);

    // Load active conversations
    const loadConversations = useCallback(async (showLoading = false) => {
        try {
            if (showLoading) setLoading(true);
            const response = await api.get("/messages/");
            setConversations(response.data.conversations || []);
        } catch (error) {
            console.error("Failed to load conversations:", error);
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    // Load friends and requests
    const loadFriends = useCallback(async (showLoading = false) => {
        try {
            if (showLoading) setLoadingFriends(true);
            setFriendsError(null);
            const response = await api.get("/messages/friends");
            setFriends(response.data.friends || []);
        } catch (error) {
            console.error("Failed to load friends/requests:", error);
            setFriendsError("Could not load requests");
        } finally {
            if (showLoading) setLoadingFriends(false);
        }
    }, []);

    // Scroll handler for auto-scroll vs user browsing
    const handleMessagesScroll = () => {
        const el = messagesRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const nearBottom = distanceFromBottom < 90;
        isNearBottomRef.current = nearBottom;
        setShowScrollBottom(!nearBottom);
    };

    const scrollToBottom = (smooth = true) => {
        if (messagesRef.current) {
            messagesRef.current.scrollTo({
                top: messagesRef.current.scrollHeight,
                behavior: smooth ? "smooth" : "auto",
            });
            isNearBottomRef.current = true;
            setShowScrollBottom(false);
        }
    };

    // Close header menu on outside click or Escape
    useEffect(() => {
        if (!menuOpen) return;
        const onClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        const onKeyDown = (e) => {
            if (e.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("mousedown", onClickOutside);
        document.addEventListener("touchstart", onClickOutside);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            document.removeEventListener("touchstart", onClickOutside);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [menuOpen]);

    // Close attachment menu on outside click
    useEffect(() => {
        if (!attachmentMenuOpen) return;
        const onClickOutside = (e) => {
            if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target)) {
                setAttachmentMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", onClickOutside);
        document.addEventListener("touchstart", onClickOutside);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            document.removeEventListener("touchstart", onClickOutside);
        };
    }, [attachmentMenuOpen]);

    // Close lightbox on Escape key
    useEffect(() => {
        if (!lightboxMedia) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setLightboxMedia(null);
                setLightboxZoom(1);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [lightboxMedia]);

    // Media helpers
    const processAndAddFiles = useCallback((fileList) => {
        const files = Array.from(fileList);
        if (!files.length) return;

        const newMedia = [];
        for (const file of files) {
            const isVideo = file.type.startsWith("video/") || /\.(mp4|webm)$/i.test(file.name);
            const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file.name);

            if (!isImage && !isVideo) {
                toast.error(`"${file.name}" is not a supported image or video format.`);
                continue;
            }

            if (isImage && file.size > 10 * 1024 * 1024) {
                toast.error(`"${file.name}" exceeds the 10 MB image size limit.`);
                continue;
            }

            if (isVideo && file.size > 50 * 1024 * 1024) {
                toast.error(`"${file.name}" exceeds the 50 MB video size limit.`);
                continue;
            }

            const previewUrl = URL.createObjectURL(file);
            newMedia.push({
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                file,
                name: file.name,
                size: file.size,
                type: isVideo ? "video" : "image",
                previewUrl,
            });
        }

        if (newMedia.length > 0) {
            setSelectedMedia((prev) => [...prev, ...newMedia]);
        }
    }, [toast]);

    const removeSelectedMedia = useCallback((idToRemove) => {
        setSelectedMedia((prev) => {
            const item = prev.find((m) => m.id === idToRemove);
            if (item?.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
            return prev.filter((m) => m.id !== idToRemove);
        });
    }, []);

    const clearAllSelectedMedia = useCallback(() => {
        setSelectedMedia((prev) => {
            prev.forEach((m) => {
                if (m.previewUrl) URL.revokeObjectURL(m.previewUrl);
            });
            return [];
        });
        setUploadProgress(null);
    }, []);

    const handleDownloadMedia = async (attachment) => {
        try {
            const res = await api.get(`/messages/media/${attachment.id}`, { responseType: "blob" });
            const blobUrl = URL.createObjectURL(res.data);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = attachment.original_filename || `coroomies-media-${attachment.id}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch {
            toast.error("Failed to download media");
        }
    };

    useEffect(() => {
        if (!lightboxMedia) {
            return undefined;
        }
        let active = true;
        let objectUrl = null;
        api.get(`/messages/media/${lightboxMedia.id}`, { responseType: "blob" })
            .then((response) => {
                objectUrl = URL.createObjectURL(response.data);
                if (active) setLightboxUrl(objectUrl);
            })
            .catch(() => active && setLightboxUrl(null));
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [lightboxMedia]);

    // Handle browser back button on mobile when in chat view
    useEffect(() => {
        if (mobileView === "chat") {
            window.history.pushState({ coroomiesChatView: true }, "");
            const onPopState = () => {
                setMobileView("list");
            };
            window.addEventListener("popstate", onPopState);
            return () => window.removeEventListener("popstate", onPopState);
        }
    }, [mobileView]);

    // Load messages with a peer
    const loadMessages = useCallback(async (userId, showLoading = true) => {
        try {
            if (showLoading) setLoadingMessages(true);
            setMobileView("chat");
            sessionStorage.setItem("coroomies_active_chat_peer", String(userId));

            const response = await api.get(`/messages/${userId}`);
            setSelectedUser(response.data.user || { id: userId });
            setMessages(response.data.messages || []);
            setFailedMessage(null);

            // Mark conversation read on server
            api.put(`/messages/${userId}/read`).then(() => {
                window.dispatchEvent(new Event("coroomies:refresh-counts"));
            }).catch(() => null);

            loadConversations();
        } catch (error) {
            toast.error(errorMessage(error, "Failed to load messages"));
        } finally {
            if (showLoading) setLoadingMessages(false);
        }
    }, [loadConversations, toast]);

    // Deep link or notification opening a specific chat
    useEffect(() => {
        const handleOpenPeer = (peerId) => {
            const id = Number(peerId);
            if (!Number.isNaN(id) && id > 0) {
                loadMessages(id, true);
            }
        };

        // 1. Check localStorage chat_peer
        const peer = localStorage.getItem("chat_peer");
        if (peer) {
            localStorage.removeItem("chat_peer");
            handleOpenPeer(peer);
        } else {
            // 2. Restore active conversation from sessionStorage
            const sessionPeer = sessionStorage.getItem("coroomies_active_chat_peer");
            if (sessionPeer) {
                handleOpenPeer(sessionPeer);
            }
        }

        // 3. Listen for window event dispatched by notifications or dashboard
        const onOpenChatEvent = (e) => {
            if (e.detail?.peerId) {
                handleOpenPeer(e.detail.peerId);
            }
        };
        window.addEventListener("coroomies:open-chat", onOpenChatEvent);
        return () => window.removeEventListener("coroomies:open-chat", onOpenChatEvent);
    }, [loadMessages]);

    // Send a message
    const sendMessage = async (overrideContent = null) => {
        const contentToSend = (overrideContent !== null ? overrideContent : text).trim();
        const hasMedia = selectedMedia.length > 0;
        if ((!contentToSend && !hasMedia) || !selectedUser || sendingMessage) return;

        try {
            setSendingMessage(true);
            setFailedMessage(null);
            isNearBottomRef.current = true;

            if (hasMedia) {
                const formData = new FormData();
                formData.append("receiver_id", String(selectedUser.id));
                if (contentToSend) {
                    formData.append("content", contentToSend);
                }
                selectedMedia.forEach((item) => {
                    formData.append("files", item.file);
                });

                await api.post("/messages/media", formData, {
                    headers: {
                        "Content-Type": "multipart/form-data",
                    },
                    onUploadProgress: (progressEvent) => {
                        if (progressEvent.total) {
                            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                            setUploadProgress(pct);
                        }
                    },
                });

                clearAllSelectedMedia();
            } else {
                await api.post("/messages/", {
                    receiver_id: selectedUser.id,
                    content: contentToSend,
                });
            }

            if (overrideContent === null) setText("");
            await loadMessages(selectedUser.id, false);
            await loadConversations();
            window.dispatchEvent(new Event("coroomies:refresh-counts"));
            scrollToBottom(true);
        } catch (error) {
            toast.error(errorMessage(error, "Could not send message"));
            if (!hasMedia) {
                setFailedMessage({ content: contentToSend, receiver_id: selectedUser.id });
            }
        } finally {
            setSendingMessage(false);
            setUploadProgress(null);
        }
    };

    // Share living group invitation
    const shareLivingGroupInvite = async () => {
        if (!selectedUser) return;
        try {
            setSendingMessage(true);
            const res = await api.get("/groups/");
            const myGroup =
                res.data.groups?.find(
                    (g) =>
                        g.invite_code &&
                        (g.status === "active" || g.status === "pending")
                ) ||
                res.data.groups?.find((g) => g.invite_code);

            if (!myGroup?.invite_code) {
                toast.info(
                    "You don't have an active living group yet. Create or join one first in Living Groups."
                );
                return;
            }

            const inviteLink = `${window.location.origin}/?join=${myGroup.invite_code}`;
            const content = `Hey! Join our living group "${myGroup.name}" on CoRoomies: ${inviteLink} (Invite code: ${myGroup.invite_code})`;

            await api.post("/messages/", {
                receiver_id: selectedUser.id,
                content,
            });

            toast.success(`Sent invitation for "${myGroup.name}"!`);
            await loadMessages(selectedUser.id, false);
            await loadConversations();
            scrollToBottom(true);
        } catch (error) {
            toast.error(errorMessage(error, "Could not share living group invitation"));
        } finally {
            setSendingMessage(false);
            setMenuOpen(false);
        }
    };

    // Toggle mute notifications for peer
    const toggleMutePeer = async () => {
        if (!selectedUser?.id) return;
        try {
            const nextState = !selectedUser.is_muted;
            await api.put(`/messages/${selectedUser.id}/mute`, { is_muted: nextState });
            setSelectedUser((prev) => ({ ...prev, is_muted: nextState }));
            setConversations((prev) =>
                prev.map((c) =>
                    c.user_id === selectedUser.id ? { ...c, is_muted: nextState } : c
                )
            );
            toast.success(
                nextState
                    ? `Muted notifications from ${selectedUser.name}`
                    : `Unmuted notifications from ${selectedUser.name}`
            );
        } catch (error) {
            toast.error(errorMessage(error, "Could not update notification settings"));
        } finally {
            setMenuOpen(false);
        }
    };

    // View peer profile
    const openPeerProfile = async (userId) => {
        const targetId = userId || selectedUser?.id;
        if (!targetId) return;
        try {
            setLoadingPeerProfile(true);
            setPeerProfileModalOpen(true);
            setMenuOpen(false);
            const res = await api.get(`/profile/${targetId}`);
            setPeerProfile(res.data);
        } catch (error) {
            toast.error(errorMessage(error, "Could not load profile"));
            setPeerProfileModalOpen(false);
        } finally {
            setLoadingPeerProfile(false);
        }
    };

    // Block user
    const handleBlockUser = async () => {
        if (!selectedUser?.id) return;
        try {
            setBlocking(true);
            await api.post(`/messages/${selectedUser.id}/block`);
            toast.success(`Blocked ${selectedUser.name}`);
            setBlockConfirmOpen(false);
            setSelectedUser((prev) => ({ ...prev, is_blocked: true }));
            loadConversations();
            loadFriends();
            window.dispatchEvent(new CustomEvent("coroomies:refresh-counts"));
        } catch (error) {
            toast.error(errorMessage(error, "Could not block user"));
        } finally {
            setBlocking(false);
            setMenuOpen(false);
        }
    };

    // Unblock user
    const handleUnblockUser = async () => {
        if (!selectedUser?.id) return;
        try {
            setUnblocking(true);
            await api.post(`/messages/${selectedUser.id}/unblock`);
            toast.success(`Unblocked ${selectedUser.name}`);
            setUnblockConfirmOpen(false);
            setSelectedUser((prev) => ({ ...prev, is_blocked: false }));
            loadConversations();
            loadFriends();
            window.dispatchEvent(new CustomEvent("coroomies:refresh-counts"));
        } catch (error) {
            toast.error(errorMessage(error, "Could not unblock user"));
        } finally {
            setUnblocking(false);
            setMenuOpen(false);
        }
    };

    // Report user
    const handleReportUser = async () => {
        if (!selectedUser?.id || !reportReason) return;
        try {
            setReporting(true);
            await api.post(`/messages/${selectedUser.id}/report`, {
                reason: reportReason,
                details: reportDetails.trim() || undefined,
            });
            toast.success("Report submitted. Our moderation team is reviewing it.");
            setReportModalOpen(false);
            setReportDetails("");
        } catch (error) {
            toast.error(errorMessage(error, "Could not submit report"));
        } finally {
            setReporting(false);
            setMenuOpen(false);
        }
    };

    // Clear conversation
    const handleClearConversation = async () => {
        if (!selectedUser?.id) return;
        try {
            setClearingChat(true);
            await api.delete(`/messages/conversation/${selectedUser.id}`);
            setMessages([]);
            toast.success("Conversation cleared");
            setClearChatConfirmOpen(false);
            loadConversations();
        } catch (error) {
            toast.error(errorMessage(error, "Could not clear conversation"));
        } finally {
            setClearingChat(false);
            setMenuOpen(false);
        }
    };

    // Delete single message
    const deleteMessage = async () => {
        if (!deleteTarget?.id) return;
        try {
            setDeleting(true);
            await api.delete(`/messages/${deleteTarget.id}`);
            toast.success("Message deleted");
            setDeleteTarget(null);
            if (selectedUser?.id) {
                await loadMessages(selectedUser.id, false);
            }
        } catch (error) {
            toast.error(errorMessage(error, "Could not delete message"));
        } finally {
            setDeleting(false);
        }
    };

    const selectedUserId = selectedUser?.id;

    // Silent background poll every 6 seconds
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadConversations();
        loadFriends();
        const interval = setInterval(() => {
            loadConversations();
            loadFriends();
            if (selectedUserId) {
                loadMessages(selectedUserId, false);
            }
        }, 6000);
        return () => clearInterval(interval);
    }, [selectedUserId, loadConversations, loadFriends, loadMessages]);

    // Auto-scroll when messages update or conversation switched
    useEffect(() => {
        const peerChanged = lastPeerIdRef.current !== selectedUser?.id;
        if (peerChanged) {
            lastPeerIdRef.current = selectedUser?.id;
            isNearBottomRef.current = true;
            setShowScrollBottom(false);
        }
        if (messagesRef.current && (isNearBottomRef.current || peerChanged)) {
            scrollToBottom(!peerChanged);
        }
    }, [messages, selectedUser]);

    // Search filter across active view
    const filteredConversations = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter(
            (c) =>
                (c.name || "").toLowerCase().includes(q) ||
                (c.username || "").toLowerCase().includes(q) ||
                (c.last_message || "").toLowerCase().includes(q)
        );
    }, [conversations, searchTerm]);

    const filteredFriends = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return friends.filter(
            (f) =>
                f.status === "accepted" &&
                (!q ||
                    (f.name || "").toLowerCase().includes(q) ||
                    (f.username || "").toLowerCase().includes(q))
        );
    }, [friends, searchTerm]);

    const totalUnreadMessages = useMemo(() => {
        return conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    }, [conversations]);

    // Quick direct join living group from message card
    const handleQuickJoinFromMessage = (code) => {
        if (!code) return;
        localStorage.setItem("coroomies_join_code", code.trim().toUpperCase());
        window.location.href = `/?join=${code.trim().toUpperCase()}`;
    };

    // Render message body with clickable URLs and living group invitation cards
    const renderMessageContent = (content) => {
        if (!content) return null;

        // Check if message is a living group invite
        const inviteMatch = content.match(
            /(?:join=([A-Z0-9]{4,12})|code:?\s*([A-Z0-9]{4,12}))/i
        );
        const inviteCode = inviteMatch ? (inviteMatch[1] || inviteMatch[2]).toUpperCase() : null;

        // URL link regex
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = content.split(urlRegex);

        return (
            <div className="space-y-2">
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                    {parts.map((part, i) => {
                        if (part.match(urlRegex)) {
                            return (
                                <a
                                    key={i}
                                    href={part}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline font-semibold hover:opacity-85 text-inherit"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {part}
                                </a>
                            );
                        }
                        return part;
                    })}
                </p>

                {inviteCode && (
                    <div className="rounded-xl border border-brand-200/90 dark:border-brand-700/80 bg-white/95 dark:bg-slate-900/90 p-2.5 text-slate-800 dark:text-slate-100 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/60 text-brand-600 dark:text-brand-300">
                                    <UsersRoundIcon className="h-4 w-4" />
                                </span>
                                <div>
                                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                        Living Group Invitation
                                    </p>
                                    <p className="font-mono text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                                        Code: {inviteCode}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleQuickJoinFromMessage(inviteCode)}
                                className="rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:scale-[1.02] active:scale-95"
                            >
                                Join Group
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Render media attachments inside message bubble
    const renderMessageAttachments = (attachments, isOwn) => {
        if (!attachments || attachments.length === 0) return null;

        return (
            <div className="mt-2 space-y-2">
                {attachments.map((att) => (
                    <ProtectedAttachment
                        key={att.id}
                        attachment={att}
                        isOwn={isOwn}
                        onExpand={() => {
                            setLightboxMedia(att);
                            setLightboxZoom(1);
                        }}
                    />
                ))}
            </div>
        );
    };

    return (
        <div className="app-panel relative flex min-h-[380px] sm:min-h-[500px] h-[calc(100dvh-11rem)] sm:h-[calc(100vh-140px)] max-h-[850px] rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800 shadow-sm overflow-visible">
            {/* Conversation list panel */}
            <div
                className={`w-full min-h-0 flex-col border-r border-slate-200 dark:border-slate-700/80 sm:flex sm:w-80 lg:w-88 sm:shrink-0 ${
                    mobileView === "chat" ? "hidden" : "flex"
                }`}
            >
                {/* Header & Tabs */}
                <div className="relative border-b border-slate-100 dark:border-slate-700 p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                                Messages
                            </h2>
                            {totalUnreadMessages > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">
                                    {totalUnreadMessages}
                                </span>
                            )}
                        </div>

                        {/* Top action triggers */}
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => {
                                    loadConversations(true);
                                    loadFriends(true);
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                                title="Refresh conversations"
                                aria-label="Refresh conversations"
                            >
                                <RefreshCwIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Section Switcher Tabs */}
                    <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-750 p-1">
                        {[
                            {
                                key: "chats",
                                label: "Chats",
                                count: totalUnreadMessages,
                                badgeType: "brand",
                            },
                            {
                                key: "friends",
                                label: "Friends",
                                count: filteredFriends.length,
                                badgeType: "slate",
                            },
                        ].map((t) => {
                            const active = view === t.key;
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setView(t.key)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-xs font-bold transition-all ${
                                        active
                                            ? "bg-white dark:bg-slate-800 text-brand-700 dark:text-brand-300 shadow-sm"
                                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                                    }`}
                                >
                                    <span>{t.label}</span>
                                    {t.count > 0 && (
                                        <span
                                            className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                                t.badgeType === "brand"
                                                    ? "bg-brand-500 text-white"
                                                    : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                                            }`}
                                        >
                                            {t.count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Search Field */}
                    <div className="relative mt-2.5">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder={
                                view === "friends"
                                    ? "Search friends..."
                                    : "Search conversations..."
                            }
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 pl-9 pr-8 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <XIcon className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab content area */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                    {/* CHATS TAB */}
                    {view === "chats" && (
                        loading && conversations.length === 0 ? (
                            <div className="flex justify-center py-12">
                                <Spinner />
                            </div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="px-4 py-12 text-center">
                                <MessageCircleIcon className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {searchTerm
                                        ? `No conversations matching "${searchTerm}"`
                                        : "No conversations yet"}
                                </p>
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm("")}
                                        className="mt-2 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                                    >
                                        Clear search
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredConversations.map((conv) => {
                                const active = selectedUser?.id === conv.user_id;
                                return (
                                    <button
                                        key={conv.user_id}
                                        type="button"
                                        onClick={() => loadMessages(conv.user_id)}
                                        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors border-l-2 ${
                                            active
                                                ? "border-brand-600 bg-brand-50/60 dark:bg-brand-950/30 text-brand-950 dark:text-brand-50"
                                                : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-750"
                                        }`}
                                    >
                                        <Avatar
                                            name={conv.name}
                                            src={conv.avatar_url ? `${API_BASE}${conv.avatar_url}` : undefined}
                                            size="md"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                                                        {conv.name}
                                                    </p>
                                                    {conv.is_muted && (
                                                        <BellOffIcon className="h-3 w-3 shrink-0 text-slate-400" title="Notifications muted" />
                                                    )}
                                                </div>
                                                {conv.last_message_at && (
                                                    <span className="shrink-0 text-[10px] text-slate-400">
                                                        {formatRelativeTime(conv.last_message_at)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between gap-2 mt-0.5">
                                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                    {conv.last_message || "Send a message..."}
                                                </p>
                                                {conv.unread_count > 0 && (
                                                    <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white shrink-0">
                                                        {conv.unread_count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )
                    )}

                    {/* FRIENDS TAB */}
                    {view === "friends" && (
                        loadingFriends ? (
                            <div className="flex justify-center py-12">
                                <Spinner />
                            </div>
                        ) : friendsError ? (
                            <div className="p-4 text-center">
                                <p className="text-xs text-rose-500 mb-2">{friendsError}</p>
                                <Button size="sm" variant="secondary" onClick={() => loadFriends(true)}>
                                    Retry
                                </Button>
                            </div>
                        ) : filteredFriends.length === 0 ? (
                            <div className="px-4 py-12 text-center">
                                <UsersRoundIcon className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {searchTerm
                                        ? `No friends matching "${searchTerm}"`
                                        : "No friends connected yet. Connect with others or accept a request to start chatting!"}
                                </p>
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm("")}
                                        className="mt-2 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                                    >
                                        Clear search
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredFriends.map((friend) => {
                                const active = selectedUser?.id === friend.user_id;
                                return (
                                    <div
                                        key={friend.user_id}
                                        className={`group flex items-center justify-between gap-2.5 px-3.5 py-3 transition-colors border-l-2 ${
                                            active
                                                ? "border-brand-600 bg-brand-50/60 dark:bg-brand-950/30 text-brand-950 dark:text-brand-50"
                                                : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-750"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => loadMessages(friend.user_id)}
                                            className="flex flex-1 items-center gap-3 min-w-0 text-left focus:outline-none"
                                        >
                                            <Avatar
                                                name={friend.name}
                                                src={friend.avatar_url ? `${API_BASE}${friend.avatar_url}` : undefined}
                                                size="md"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                                                    {friend.name}
                                                </p>
                                                <p className="truncate text-xs text-slate-400 mt-0.5">
                                                    {friend.username ? `@${friend.username}` : "Connected friend"}
                                                </p>
                                            </div>
                                        </button>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openPeerProfile(friend.user_id);
                                                }}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                                                title={`View ${friend.name}'s profile`}
                                                aria-label={`View ${friend.name}'s profile`}
                                            >
                                                <UserRoundIcon className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => loadMessages(friend.user_id)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"
                                                title={`Message ${friend.name}`}
                                                aria-label={`Message ${friend.name}`}
                                            >
                                                <MessageCircleIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )
                    )}
                </div>
            </div>

            {/* Chat conversation panel */}
            <div
                className={`min-w-0 flex-1 flex-col overflow-hidden sm:flex ${
                    mobileView === "chat" ? "flex" : "hidden"
                }`}
            >
                {!selectedUser ? (
                    /* Blank / Unselected conversation state */
                    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/40 p-6 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-lg shadow-brand-500/20">
                            <MessageCircleIcon className="h-8 w-8" />
                        </div>
                        <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">
                            Your Messages
                        </h3>
                        <p className="mt-1.5 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                            Select a conversation or friend from the list to start chatting and coordinating.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Conversation Header */}
                        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/80 px-3.5 py-3 sm:px-5 sm:py-3.5 bg-white dark:bg-slate-800 z-10">
                            <button
                                type="button"
                                onClick={() => {
                                    setMobileView("list");
                                    setSelectedUser(null);
                                }}
                                className="flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 sm:hidden"
                                aria-label="Back to conversations list"
                            >
                                <ArrowLeftIcon className="h-5 w-5" />
                            </button>

                            <button
                                type="button"
                                onClick={() => openPeerProfile(selectedUser.id)}
                                className="flex items-center gap-3 min-w-0 text-left hover:opacity-85 transition-opacity"
                                title="View profile"
                            >
                                <Avatar
                                    name={selectedUser.name}
                                    src={selectedUser.avatar_url ? `${API_BASE}${selectedUser.avatar_url}` : undefined}
                                    size="md"
                                />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                            {selectedUser.name}
                                        </p>
                                        {selectedUser.is_muted && (
                                            <BellOffIcon className="h-3.5 w-3.5 text-slate-400" title="Muted" />
                                        )}
                                        {selectedUser.is_blocked && (
                                            <Badge variant="danger">Blocked</Badge>
                                        )}
                                    </div>
                                    <p className="truncate text-[11px] text-slate-400">
                                        {selectedUser.username ? `@${selectedUser.username}` : selectedUser.email || "Connected"} • Click to view profile
                                    </p>
                                </div>
                            </button>

                            {/* Header action buttons */}
                            <div className="ml-auto flex items-center gap-1.5">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={shareLivingGroupInvite}
                                    disabled={sendingMessage}
                                    className="hidden sm:flex items-center gap-1.5 text-xs py-1.5 px-3"
                                    title="Share Living Group invitation"
                                >
                                    <UsersRoundIcon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                                    <span>Share Group</span>
                                </Button>

                                {/* 3-dot dropdown menu */}
                                <div className="relative" ref={menuRef}>
                                    <button
                                        type="button"
                                        onClick={() => setMenuOpen((prev) => !prev)}
                                        className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                                        aria-label="Conversation options"
                                        aria-haspopup="menu"
                                        aria-expanded={menuOpen}
                                    >
                                        <EllipsisVerticalIcon className="h-4.5 w-4.5" />
                                    </button>

                                    {menuOpen && (
                                        <div
                                            className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shadow-xl ring-1 ring-black/5 animate-slide-up"
                                            role="menu"
                                        >
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => openPeerProfile(selectedUser.id)}
                                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                            >
                                                <UserRoundIcon className="h-4 w-4 text-slate-400" />
                                                <span>View Profile</span>
                                            </button>

                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={toggleMutePeer}
                                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                            >
                                                {selectedUser.is_muted ? (
                                                    <>
                                                        <BellIcon className="h-4 w-4 text-emerald-500" />
                                                        <span>Unmute Notifications</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <BellOffIcon className="h-4 w-4 text-slate-400" />
                                                        <span>Mute Notifications</span>
                                                    </>
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={shareLivingGroupInvite}
                                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                            >
                                                <Share2Icon className="h-4 w-4 text-brand-500" />
                                                <span>Share Living Group</span>
                                            </button>

                                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setClearChatConfirmOpen(true);
                                                    setMenuOpen(false);
                                                }}
                                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                            >
                                                <Trash2Icon className="h-4 w-4" />
                                                <span>Clear Conversation</span>
                                            </button>

                                            {selectedUser.is_blocked ? (
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setUnblockConfirmOpen(true);
                                                        setMenuOpen(false);
                                                    }}
                                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30"
                                                >
                                                    <ShieldCheckIcon className="h-4 w-4" />
                                                    <span>Unblock User</span>
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setBlockConfirmOpen(true);
                                                        setMenuOpen(false);
                                                    }}
                                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                                >
                                                    <ShieldCheckIcon className="h-4 w-4" />
                                                    <span>Block User</span>
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setReportModalOpen(true);
                                                    setMenuOpen(false);
                                                }}
                                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                            >
                                                <FlagIcon className="h-4 w-4" />
                                                <span>Report User</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Messages scroll area */}
                        <div
                            className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-900/60"
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDraggingOver(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                setIsDraggingOver(false);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDraggingOver(false);
                                if (e.dataTransfer?.files) {
                                    processAndAddFiles(e.dataTransfer.files);
                                }
                            }}
                        >
                            {isDraggingOver && (
                                <div className="absolute inset-0 z-30 flex items-center justify-center bg-brand-500/10 backdrop-blur-xs border-2 border-dashed border-brand-500 rounded-none pointer-events-none">
                                    <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 p-4 shadow-xl text-center">
                                        <PaperclipIcon className="mx-auto h-8 w-8 text-brand-600 dark:text-brand-400 mb-2" />
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                            Drop photos or videos here to share
                                        </p>
                                    </div>
                                </div>
                            )}
                            <div
                                ref={messagesRef}
                                onScroll={handleMessagesScroll}
                                className="flex-1 space-y-3 overflow-y-auto p-3.5 sm:p-5 touch-scroll"
                            >
                                {loadingMessages ? (
                                    <div className="flex justify-center py-16">
                                        <Spinner size="lg" />
                                    </div>
                                ) : (
                                    <>
                                        {/* Welcoming Top Card / Icebreaker section */}
                                        <div className="mx-auto max-w-sm rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-4 text-center shadow-xs">
                                            <Avatar
                                                name={selectedUser.name}
                                                src={selectedUser.avatar_url ? `${API_BASE}${selectedUser.avatar_url}` : undefined}
                                                size="lg"
                                                className="mx-auto"
                                            />
                                            <h4 className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                                                {selectedUser.name}
                                            </h4>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                You and {selectedUser.name} are connected.
                                            </p>

                                            {messages.length === 0 && (
                                                <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                                                    <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                                                        Conversation Starters
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5 justify-center">
                                                        {ICEBREAKERS.map((prompt, i) => (
                                                            <button
                                                                key={i}
                                                                type="button"
                                                                onClick={() => {
                                                                    setText(prompt);
                                                                }}
                                                                className="rounded-full border border-brand-200 dark:border-brand-700 bg-brand-50/70 dark:bg-brand-950/40 px-2.5 py-1 text-[11px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/60 transition-colors"
                                                            >
                                                                {prompt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Message thread items */}
                                        {messages.map((message, index) => {
                                            const isOwn = message.sender_id === currentUserId;
                                            const showDate =
                                                index === 0 ||
                                                new Date(messages[index - 1].created_at).toDateString() !==
                                                    new Date(message.created_at).toDateString();

                                            return (
                                                <div key={message.id} className="space-y-2">
                                                    {showDate && (
                                                        <div className="my-4 flex justify-center">
                                                            <span className="rounded-full bg-white dark:bg-slate-800 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shadow-xs border border-slate-200/60 dark:border-slate-700">
                                                                {formatRelativeDay(message.created_at)}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div
                                                        className={`group flex items-end gap-1.5 ${
                                                            isOwn ? "justify-end" : "justify-start"
                                                        }`}
                                                    >
                                                        {!isOwn && (
                                                            <Avatar
                                                                name={selectedUser.name}
                                                                src={selectedUser.avatar_url ? `${API_BASE}${selectedUser.avatar_url}` : undefined}
                                                                size="xs"
                                                                className="mb-1"
                                                            />
                                                        )}

                                                        <div
                                                            className={`relative max-w-[82%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                                                                isOwn
                                                                    ? "rounded-br-sm bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-brand-500/20"
                                                                    : "rounded-bl-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700"
                                                            }`}
                                                        >
                                                            {message.content && renderMessageContent(message.content)}
                                                            {renderMessageAttachments(message.attachments, isOwn)}
                                                            <div className="mt-1 flex items-center justify-end gap-1">
                                                                <span
                                                                    className={`text-[10px] ${
                                                                        isOwn
                                                                            ? "text-brand-100/80"
                                                                            : "text-slate-400 dark:text-slate-500"
                                                                    }`}
                                                                >
                                                                    {formatTime(message.created_at)}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {isOwn && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setDeleteTarget(message)}
                                                                className="mb-1 flex h-6 w-6 items-center justify-center rounded-lg text-slate-300 opacity-60 hover:opacity-100 hover:text-rose-500 dark:hover:text-rose-400 transition-all"
                                                                title="Delete message"
                                                                aria-label="Delete message"
                                                            >
                                                                <Trash2Icon className="h-3 w-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Failed message notice with Retry */}
                                        {failedMessage && (
                                            <div className="flex justify-end">
                                                <div className="max-w-[80%] rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
                                                    <span>Message failed to send.</span>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => sendMessage(failedMessage.content)}
                                                            className="font-bold underline hover:opacity-80"
                                                        >
                                                            Retry
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setFailedMessage(null)}
                                                            className="hover:opacity-80"
                                                        >
                                                            Dismiss
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Floating Scroll to Bottom pill */}
                            {showScrollBottom && (
                                <button
                                    type="button"
                                    onClick={() => scrollToBottom(true)}
                                    className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-slate-900/90 dark:bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition-all hover:scale-105 active:scale-95 z-20"
                                >
                                    <ChevronDownIcon className="h-3.5 w-3.5" />
                                    <span>Latest messages</span>
                                </button>
                            )}
                        </div>

                        {/* Message composer */}
                        <div className="shrink-0 border-t border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-2.5 sm:p-3.5">
                            {selectedUser.is_blocked ? (
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 rounded-xl bg-slate-100 dark:bg-slate-750 p-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                                    <span>You have blocked this user. Unblock them to send messages.</span>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setUnblockConfirmOpen(true)}
                                        className="w-full sm:w-auto text-xs shrink-0 font-semibold justify-center"
                                    >
                                        Unblock {selectedUser.name}
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    {/* Selected media preview tray */}
                                    {selectedMedia.length > 0 && (
                                        <div className="mb-2.5 flex flex-wrap gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 p-2">
                                            {selectedMedia.map((media) => (
                                                <div
                                                    key={media.id}
                                                    className="relative group flex items-center gap-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 p-1.5 shadow-xs"
                                                >
                                                    {media.type === "image" ? (
                                                        <img
                                                            src={media.previewUrl}
                                                            alt={media.name}
                                                            className="h-12 w-12 rounded-md object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                                                            <VideoIcon className="h-6 w-6" />
                                                        </div>
                                                    )}
                                                    <div className="max-w-[120px] sm:max-w-[160px] min-w-0 pr-6">
                                                        <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                                                            {media.name}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400">
                                                            {formatFileSize(media.size)}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSelectedMedia(media.id)}
                                                        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-700 dark:hover:bg-rose-950 dark:hover:text-rose-400 text-slate-500 transition-colors"
                                                        aria-label="Remove media"
                                                    >
                                                        <XIcon className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            {uploadProgress !== null && (
                                                <div className="w-full mt-1">
                                                    <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                                                        <span>Uploading media...</span>
                                                        <span>{uploadProgress}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                                        <div
                                                            className="h-full bg-brand-600 transition-all duration-200 rounded-full"
                                                            style={{ width: `${uploadProgress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <form
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            sendMessage();
                                        }}
                                        className="flex items-center gap-1.5 sm:gap-2"
                                    >
                                        {/* Hidden File Inputs */}
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/jpg"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files) processAndAddFiles(e.target.files);
                                                e.target.value = "";
                                            }}
                                        />
                                        <input
                                            ref={videoInputRef}
                                            type="file"
                                            accept="video/mp4,video/webm"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files) processAndAddFiles(e.target.files);
                                                e.target.value = "";
                                            }}
                                        />
                                        <input
                                            ref={cameraInputRef}
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files) processAndAddFiles(e.target.files);
                                                e.target.value = "";
                                            }}
                                        />

                                        {/* Attachment Button & Popup Menu */}
                                        <div className="relative" ref={attachmentMenuRef}>
                                            <button
                                                type="button"
                                                onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                                                disabled={sendingMessage}
                                                className="flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                                aria-label="Attach photos or videos"
                                                title="Attach photos or videos"
                                                aria-expanded={attachmentMenuOpen}
                                            >
                                                <PaperclipIcon className="h-5 w-5" />
                                            </button>

                                            {attachmentMenuOpen && (
                                                <div className="absolute bottom-12 left-0 z-40 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shadow-xl animate-slide-up">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAttachmentMenuOpen(false);
                                                            fileInputRef.current?.click();
                                                        }}
                                                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                                    >
                                                        <ImageIcon className="h-4 w-4 text-emerald-500" />
                                                        <span>Photos</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAttachmentMenuOpen(false);
                                                            videoInputRef.current?.click();
                                                        }}
                                                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                                    >
                                                        <VideoIcon className="h-4 w-4 text-purple-500" />
                                                        <span>Videos</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAttachmentMenuOpen(false);
                                                            cameraInputRef.current?.click();
                                                        }}
                                                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                                    >
                                                        <CameraIcon className="h-4 w-4 text-blue-500" />
                                                        <span>Camera</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <input
                                            type="text"
                                            value={text}
                                            placeholder={selectedMedia.length > 0 ? "Add a caption (optional)..." : "Type a message..."}
                                            onChange={(e) => setText(e.target.value)}
                                            onPaste={(e) => {
                                                if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
                                                    processAndAddFiles(e.clipboardData.files);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    sendMessage();
                                                }
                                            }}
                                            disabled={sendingMessage}
                                            className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                        />
                                        <Button
                                            type="submit"
                                            disabled={(!text.trim() && selectedMedia.length === 0) || sendingMessage}
                                            loading={sendingMessage}
                                            className="shrink-0 rounded-xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm min-h-[44px]"
                                        >
                                            <SendIcon className="h-4 w-4" />
                                            <span className="hidden sm:inline">Send</span>
                                        </Button>
                                    </form>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Peer Profile Modal */}
            <Modal
                open={peerProfileModalOpen}
                onClose={() => setPeerProfileModalOpen(false)}
                title="User Profile"
            >
                {loadingPeerProfile ? (
                    <div className="flex justify-center py-10">
                        <Spinner size="lg" />
                    </div>
                ) : peerProfile ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-brand-50/60 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-800">
                            <Avatar
                                name={peerProfile.name}
                                src={peerProfile.avatar_url ? `${API_BASE}${peerProfile.avatar_url}` : undefined}
                                size="lg"
                            />
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                                    {peerProfile.name}
                                </h3>
                                {peerProfile.email ? (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {peerProfile.email}
                                    </p>
                                ) : (
                                    <Badge variant="success">Confirmed Roommate</Badge>
                                )}
                            </div>
                        </div>

                        {peerProfile.profile ? (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl bg-slate-50 dark:bg-slate-750 p-2.5 border border-slate-100 dark:border-slate-700">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Sleep Schedule</span>
                                    <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                                        {peerProfile.profile.sleep_schedule || "Flexible"}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-slate-750 p-2.5 border border-slate-100 dark:border-slate-700">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Cleanliness</span>
                                    <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                                        {peerProfile.profile.cleanliness || "Moderate"}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-slate-750 p-2.5 border border-slate-100 dark:border-slate-700">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Food Preferences</span>
                                    <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                                        {peerProfile.profile.food_preferences || "Any"}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-slate-750 p-2.5 border border-slate-100 dark:border-slate-700">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Noise Tolerance</span>
                                    <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                                        {peerProfile.profile.noise_tolerance || "Moderate"}
                                    </p>
                                </div>
                                {peerProfile.profile.college && (
                                    <div className="col-span-2 rounded-xl bg-slate-50 dark:bg-slate-750 p-2.5 border border-slate-100 dark:border-slate-700">
                                        <span className="text-[10px] uppercase font-bold text-slate-400">College / University</span>
                                        <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                                            {peerProfile.profile.college} {peerProfile.profile.degree ? `• ${peerProfile.profile.degree}` : ""}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 text-center py-4">
                                No additional lifestyle preferences set yet.
                            </p>
                        )}

                        <div className="pt-2 flex justify-end">
                            <Button variant="secondary" onClick={() => setPeerProfileModalOpen(false)}>
                                Close
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Modal>

            {/* Block user confirm dialog */}
            <ConfirmDialog
                open={blockConfirmOpen}
                title={`Block ${selectedUser?.name}?`}
                message={`Are you sure you want to block ${selectedUser?.name}? They won't be able to message you or view your updates.`}
                confirmLabel="Block User"
                loading={blocking}
                onConfirm={handleBlockUser}
                onCancel={() => setBlockConfirmOpen(false)}
            />

            {/* Unblock user confirm dialog */}
            <ConfirmDialog
                open={unblockConfirmOpen}
                title={`Unblock ${selectedUser?.name}?`}
                message={`Are you sure you want to unblock ${selectedUser?.name}? You will be able to message each other again.`}
                confirmLabel="Unblock User"
                cancelLabel="Cancel"
                variant="primary"
                loading={unblocking}
                onConfirm={handleUnblockUser}
                onCancel={() => setUnblockConfirmOpen(false)}
            />

            {/* Report user modal */}
            <Modal
                open={reportModalOpen}
                onClose={() => setReportModalOpen(false)}
                title={`Report ${selectedUser?.name}`}
            >
                <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Please describe the issue. Our moderation team reviews all reports to keep CoRoomies safe.
                    </p>
                    <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                            Reason
                        </label>
                        <select
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none"
                        >
                            <option value="Inappropriate behavior">Inappropriate behavior</option>
                            <option value="Spam or advertising">Spam or advertising</option>
                            <option value="Harassment or abuse">Harassment or abuse</option>
                            <option value="Fraud or suspicious listing">Fraud or suspicious listing</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                            Additional Details (Optional)
                        </label>
                        <textarea
                            rows={3}
                            placeholder="Provide any additional context..."
                            value={reportDetails}
                            onChange={(e) => setReportDetails(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setReportModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="danger" loading={reporting} onClick={handleReportUser}>
                            Submit Report
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Clear conversation confirm dialog */}
            <ConfirmDialog
                open={clearChatConfirmOpen}
                title="Clear conversation history?"
                message="Are you sure you want to clear this conversation? Your message history with this flatmate will be erased."
                confirmLabel="Clear Conversation"
                loading={clearingChat}
                onConfirm={handleClearConversation}
                onCancel={() => setClearChatConfirmOpen(false)}
            />

            {/* Delete single message dialog */}
            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete message?"
                message="Are you sure you want to delete this message? It will be removed for everyone in this chat."
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={deleteMessage}
                onCancel={() => setDeleteTarget(null)}
            />

            {/* Full-screen Lightbox Modal */}
            {lightboxMedia && (
                <div
                    className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm p-4 select-none animate-fade-in"
                    onClick={() => {
                        setLightboxMedia(null);
                        setLightboxZoom(1);
                    }}
                >
                    {/* Top Controls Bar */}
                    <div
                        className="flex items-center justify-between text-white pb-3 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-xs sm:text-sm font-medium text-slate-200">
                                {lightboxMedia.original_filename || "Photo"}
                            </span>
                            {lightboxMedia.file_size > 0 && (
                                <span className="text-[11px] text-slate-400">
                                    ({formatFileSize(lightboxMedia.file_size)})
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <button
                                type="button"
                                onClick={() => setLightboxZoom((z) => Math.min(3, z + 0.5))}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                title="Zoom in"
                                aria-label="Zoom in"
                            >
                                <ZoomInIcon className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setLightboxZoom((z) => Math.max(1, z - 0.5))}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                title="Zoom out"
                                aria-label="Zoom out"
                            >
                                <ZoomOutIcon className="h-4 w-4" />
                            </button>
                            {lightboxZoom !== 1 && (
                                <button
                                    type="button"
                                    onClick={() => setLightboxZoom(1)}
                                    className="rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-xs text-white transition-colors"
                                >
                                    Reset
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => handleDownloadMedia(lightboxMedia)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                title="Download"
                                aria-label="Download"
                            >
                                <DownloadIcon className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setLightboxMedia(null);
                                    setLightboxZoom(1);
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-rose-600 text-white transition-colors"
                                title="Close"
                                aria-label="Close"
                            >
                                <XIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Media Preview Center */}
                    <div
                        className="flex-1 min-h-0 flex items-center justify-center overflow-auto p-2"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {lightboxUrl ? (
                            <img src={lightboxUrl} alt={lightboxMedia.original_filename || "Photo"} style={{ transform: `scale(${lightboxZoom})`, transformOrigin: "center center" }} className="max-h-full max-w-full object-contain transition-transform duration-200" />
                        ) : (
                            <Spinner size="lg" />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Chat;

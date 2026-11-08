import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CancellationPolicy, CancellationTier, BookingSource, PaymentGatewayConfig, PaymentGatewayProvider, SmtpConfig } from '../../types';
import { getBDDateString, formatBDDate, formatBDTimeRange } from '../../utils/datetime';
import {
  ShieldCheck,
  Building2,
  Users,
  Calendar,
  Wallet,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sliders,
  Scale,
  Sparkles,
  Phone,
  HelpCircle,
  Check,
  X,
  Clock,
  ArrowRight,
  Search,
  UserCheck,
  UserX,
  Filter,
  Trophy,
  Download,
  FileText,
  Trash2,
} from 'lucide-react';
import { TournamentsView } from '../tournaments/TournamentsView';
import { apiFetch } from '../../utils/apiClient';
import { showAppAlert, showAppPrompt } from '../common/AppDialog';

const EMPTY_SMTP_CONFIGS: SmtpConfig[] = [];
const EMPTY_PAYMENT_GATEWAY_CONFIGS: PaymentGatewayConfig[] = [];
const LEGAL_PAGE_SLUGS = ['privacy-policy', 'terms-of-service', 'refund-policy'] as const;
type AdminLegalPageSlug = typeof LEGAL_PAGE_SLUGS[number];
interface AdminLegalPageDraft { title: string; content: string; published: boolean; }

export const AdminPortal: React.FC = () => {
  const {
    users,
    ownerProfiles,
    turfs,
    bookings,
    withdrawals,
    pendingRefunds,
    refreshPendingRefunds,
    cancellationPolicies,
    disputes,
    settings,
    approveTurf,
    rejectTurf,
    approveOwner,
    rejectOwner,
    requestOwnerCorrections,
    toggleUserSuspension,
    approveWithdrawal,
    rejectWithdrawal,
    processRefundWithGateway,
    markRefundProcessed,
    updatePlatformSettings,
    cancelBooking,
    updateAdminBookingStatus,
    resolveDispute,
    addCancellationPolicy,
    updateCancellationPolicy,
    deleteCancellationPolicy,
    adminActiveTab,
    setAdminActiveTab,
    featuredRequests,
    approveFeaturedRequest,
    rejectFeaturedRequest,
  } = useApp();

  const activeTab = adminActiveTab;
  const setActiveTab = setAdminActiveTab;

  useEffect(() => {
    if (activeTab !== 'disputes') return;
    void refreshPendingRefunds();
    const interval = window.setInterval(() => void refreshPendingRefunds(), 15_000);
    return () => window.clearInterval(interval);
  }, [activeTab, refreshPendingRefunds]);

  useEffect(() => {
    if (activeTab !== 'approvals') return;
    let cancelled = false;
    setTurfRemovalLoading(true);
    apiFetch('/api/admin/turf-removal-requests')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result?.success || !Array.isArray(result.data)) {
          throw new Error(result?.message || 'Unable to load turf removal requests.');
        }
        if (!cancelled) setTurfRemovalRequests(result.data);
      })
      .catch((error) => {
        if (!cancelled) showAppAlert(error instanceof Error ? error.message : 'Unable to load turf removal requests.');
      })
      .finally(() => { if (!cancelled) setTurfRemovalLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  const decideTurfRemoval = async (requestId: string, decision: 'approve' | 'reject') => {
    const reason = decision === 'reject' ? (await showAppPrompt('Why is this turf removal request being rejected?'))?.trim() : '';
    if (decision === 'reject' && !reason) return;
    try {
      const response = await apiFetch(`/api/admin/turf-removal-requests/${encodeURIComponent(requestId)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to process turf removal request.');
      setTurfRemovalRequests((previous) => previous.filter((request) => request.id !== requestId));
      showAppAlert(decision === 'approve' ? 'Turf removal approved.' : 'Turf removal rejected. The turf is active again.');
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : 'Unable to process turf removal request.');
    }
  };

  // User Management State (Section 9.1)
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 12;
  const [packageDrafts, setPackageDrafts] = useState(settings.featuredPackages || []);
  const [newPackage, setNewPackage] = useState({ name: '', price: '', durationDays: '', priority: '', description: '' });
  const [packageSaveMessage, setPackageSaveMessage] = useState('');
  const [ownerCommissions, setOwnerCommissions] = useState<Array<Record<string, unknown>>>([]);
  const [ownerCommissionsLoaded, setOwnerCommissionsLoaded] = useState(false);
  const [commissionDrafts, setCommissionDrafts] = useState<Record<string, string>>({});
  const [commissionSaving, setCommissionSaving] = useState<string | null>(null);
  const [reportFrom, setReportFrom] = useState(() => getBDDateString(-6));
  const [reportTo, setReportTo] = useState(() => getBDDateString(0));
  const [revenueReport, setRevenueReport] = useState<Record<string, unknown> | null>(null);
  const [revenueReportError, setRevenueReportError] = useState('');
  const [previewDocument, setPreviewDocument] = useState<{ fileName: string; mimeType: string; dataUrl: string; url?: string } | null>(null);
  const [correctionOwner, setCorrectionOwner] = useState<string | null>(null);
  const [correctionMessage, setCorrectionMessage] = useState('');
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [turfRemovalRequests, setTurfRemovalRequests] = useState<Array<Record<string, unknown>>>([]);
  const [turfRemovalLoading, setTurfRemovalLoading] = useState(false);
  const [turfCorrectionMessages, setTurfCorrectionMessages] = useState<Record<string, string>>({});
  const [policyDraft, setPolicyDraft] = useState<CancellationPolicy | null>(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [legalPages, setLegalPages] = useState<Record<AdminLegalPageSlug, AdminLegalPageDraft> | null>(null);
  const [legalPageSelection, setLegalPageSelection] = useState<AdminLegalPageSlug>('privacy-policy');
  const [legalPagesLoading, setLegalPagesLoading] = useState(false);
  const [legalPagesSaving, setLegalPagesSaving] = useState(false);
  const [legalPagesError, setLegalPagesError] = useState('');
  const [legalPagesMessage, setLegalPagesMessage] = useState('');
  const [policyError, setPolicyError] = useState('');

  useEffect(() => {
    setGlobalComm(settings.globalCommissionRate);
    setPlatformFee(settings.platformFeeRate);
    setMonthlySubscriptionAmount(settings.monthlySubscriptionAmount || 0);
    setBookingHoldMinutes(settings.bookingHoldMinutes ?? 10);
    setOwnerBillingSwitchEnabled(settings.ownerBillingSwitchEnabled === true);
    setPlatformFeeEnabled(settings.platformFeeEnabled !== false);
    setGatewayFeeEnabled(settings.gatewayFeeEnabled !== false);
    setShowFeeBreakdown(settings.showFeeBreakdown !== false);
    setAutoCheckInEnabled(settings.autoCheckInEnabled === true);
    setAutoCompleteEnabled(settings.autoCompleteEnabled !== false);
    setMinWd(settings.minWithdrawalAmount);
  }, [
    settings.globalCommissionRate,
    settings.platformFeeRate,
    settings.monthlySubscriptionAmount,
    settings.bookingHoldMinutes,
    settings.autoCheckInEnabled,
    settings.autoCompleteEnabled,
    settings.ownerBillingSwitchEnabled,
    settings.platformFeeEnabled,
    settings.gatewayFeeEnabled,
    settings.showFeeBreakdown,
    settings.minWithdrawalAmount,
  ]);

  const openOwnerDocumentPreview = async (document: { fileName: string; mimeType: string; dataUrl: string; url?: string }) => {
    if (document.dataUrl) { setPreviewDocument(document); return; }
    if (!document.url) { showAppAlert('The document link is unavailable.'); return; }
    try {
      const response = await apiFetch(document.url);
      if (!response.ok) throw new Error('Unable to load this verification document.');
      const blob = await response.blob();
      if (!blob.size || response.headers.get('content-type')?.includes('application/json')) throw new Error('The verification document is unavailable.');
      setPreviewDocument({ ...document, dataUrl: URL.createObjectURL(blob) });
    } catch (error) { showAppAlert(error instanceof Error ? error.message : 'Unable to load this verification document.'); }
  };

  const closeOwnerDocumentPreview = () => {
    if (previewDocument?.dataUrl.startsWith('blob:')) URL.revokeObjectURL(previewDocument.dataUrl);
    setPreviewDocument(null);
  };

  const requestTurfCorrections = async (turfId: string) => {
    const message = (await showAppPrompt('Describe the corrections required before this turf can be approved.'))?.trim();
    if (message === undefined) return;
    if (!message || message.length > 2000) {
      showAppAlert('Enter a correction message of 1 to 2,000 characters.');
      return;
    }
    try {
      const response = await apiFetch(`/api/admin/turfs/${encodeURIComponent(turfId)}/corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to request turf corrections.');
      setTurfCorrectionMessages((previous) => ({ ...previous, [turfId]: message }));
      showAppAlert('Correction request sent to the turf owner.');
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : 'Unable to request turf corrections.');
    }
  };

  const startPolicyEdit = (policy?: CancellationPolicy) => {
    setPolicyError('');
    setPolicyDraft(policy ? { ...policy, tiers: policy.tiers.map((tier) => ({ ...tier })) } : {
      id: '__new__', name: '', isDefault: false, description: '', tiers: [
        { id: 'new-tier-0', minHoursBefore: 0, maxHoursBefore: 6, refundPercentage: 0, description: '' },
        { id: 'new-tier-1', minHoursBefore: 6, maxHoursBefore: 24, refundPercentage: 50, description: '' },
        { id: 'new-tier-2', minHoursBefore: 24, refundPercentage: 100, description: '' },
      ],
    });
  };

  const updatePolicyDraft = (updates: Partial<CancellationPolicy>) => setPolicyDraft((prior) => prior ? { ...prior, ...updates } : prior);
  const updatePolicyTier = (tierId: string, updates: Partial<CancellationTier>) => setPolicyDraft((prior) => prior ? {
    ...prior, tiers: prior.tiers.map((tier) => tier.id === tierId ? { ...tier, ...updates } : tier),
  } : prior);
  const addPolicyTier = () => setPolicyDraft((prior) => {
    if (!prior || prior.tiers.length >= 20) return prior;
    const tiers = [...prior.tiers].sort((a, b) => a.minHoursBefore - b.minHoursBefore);
    const last = tiers[tiers.length - 1];
    const boundary = last.minHoursBefore + 1;
    tiers[tiers.length - 1] = { ...last, maxHoursBefore: boundary };
    tiers.push({ id: `new-tier-${Date.now()}`, minHoursBefore: boundary, refundPercentage: last.refundPercentage, description: '' });
    return { ...prior, tiers };
  });
  const removePolicyTier = (index: number) => setPolicyDraft((prior) => {
    if (!prior || prior.tiers.length <= 1) return prior;
    const tiers = [...prior.tiers].sort((a, b) => a.minHoursBefore - b.minHoursBefore);
    const removed = tiers[index];
    if (index > 0) tiers[index - 1] = { ...tiers[index - 1], maxHoursBefore: removed.maxHoursBefore };
    else tiers[1] = { ...tiers[1], minHoursBefore: 0 };
    tiers.splice(index, 1);
    return { ...prior, tiers };
  });

  const savePolicyDraft = async () => {
    if (!policyDraft) return;
    setPolicySaving(true);
    setPolicyError('');
    try {
      const policy = { name: policyDraft.name.trim(), description: policyDraft.description.trim(), isDefault: policyDraft.isDefault, tiers: [...policyDraft.tiers].sort((a, b) => a.minHoursBefore - b.minHoursBefore) };
      if (!policy.name) throw new Error('Enter a policy name.');
      if (policyDraft.id === '__new__') await addCancellationPolicy(policy);
      else await updateCancellationPolicy(policyDraft.id, policy);
      setPolicyDraft(null);
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : 'Unable to save cancellation policy.');
    } finally { setPolicySaving(false); }
  };

  const handlePrintRevenueReport = () => {
    if (!revenueReport) {
      showAppAlert('The report is still loading. Please try again in a moment.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showAppAlert('Allow pop-ups for this site to print or save the report as a PDF.');
      return;
    }
    printWindow.opener = null;
    const escapeHtml = (value: unknown) => {
      const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character] || character);
    };
    const formatMoney = (value: unknown) => `৳${Number(value || 0).toLocaleString()}`;
    const rows = (value: unknown) => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
    const summary = (revenueReport.summary || {}) as Record<string, unknown>;
    const owners = rows(revenueReport.byOwner);
    const turfs = rows(revenueReport.byTurf);
    const sources = rows(revenueReport.sourceBreakdown);
    const days = rows(revenueReport.dailyTrend);
    const makeTable = (headers: string[], body: string) => `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}">No data for this period</td></tr>`}</tbody></table>`;
    const ownerTable = makeTable(['Owner', 'Bookings', 'Gross turf value', 'Platform revenue', 'Net owner earnings'], owners.map((row) => `<tr><td>${escapeHtml(row.owner_name || 'Owner')}</td><td>${Number(row.booking_count || 0)}</td><td>${formatMoney(row.gross_turf_revenue)}</td><td>${formatMoney(row.platform_revenue)}</td><td>${formatMoney(row.net_owner_earnings)}</td></tr>`).join(''));
    const turfTable = makeTable(['Turf', 'Owner', 'Bookings', 'Gross turf value', 'Net owner earnings'], turfs.map((row) => `<tr><td>${escapeHtml(row.turf_name || 'Turf')}</td><td>${escapeHtml(row.owner_name || 'Owner')}</td><td>${Number(row.booking_count || 0)}</td><td>${formatMoney(row.gross_turf_revenue)}</td><td>${formatMoney(row.net_owner_earnings)}</td></tr>`).join(''));
    const dailyTable = makeTable(['Booking date', 'Gross booking value'], days.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${formatMoney(row.gross_turf_revenue)}</td></tr>`).join(''));
    const sourceTable = makeTable(['Booking source', 'Gross booking value'], sources.map((row) => `<tr><td>${escapeHtml(String(row.source || '').replaceAll('_', ' '))}</td><td>${formatMoney(row.total)}</td></tr>`).join(''));
    const reportHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Turfyslot revenue report</title><style>
      @page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#17231c;margin:0}h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 8px}.muted{color:#58665d}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.card{border:1px solid #cbd5ce;border-radius:6px;padding:10px}.label{font-size:9px;text-transform:uppercase;color:#58665d}.value{font-size:17px;font-weight:bold;margin-top:5px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{text-align:left;padding:7px;border-bottom:1px solid #dbe2dc}th{background:#eef3ef}section{break-inside:avoid}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.footer{margin-top:20px;color:#58665d;font-size:9px}@media print{a{color:inherit}}
      </style></head><body><h1>Turfyslot · Revenue &amp; Analytics</h1><div class="muted">Report period: ${escapeHtml(reportFrom)} to ${escapeHtml(reportTo)}</div>
      <div class="cards"><div class="card"><div class="label">Gross booking value</div><div class="value">${formatMoney(summary.gross_turf_revenue)}</div></div><div class="card"><div class="label">Platform revenue</div><div class="value">${formatMoney(summary.platform_revenue)}</div></div><div class="card"><div class="label">Net owner earnings</div><div class="value">${formatMoney(summary.net_owner_earnings)}</div></div><div class="card"><div class="label">Bookings · cancellation rate</div><div class="value">${Number(summary.booking_count || 0)} · ${Number(summary.cancellation_rate || 0).toFixed(1)}%</div></div></div>
      <div class="grid"><section><h2>Revenue by owner</h2>${ownerTable}</section><section><h2>Revenue by turf</h2>${turfTable}</section><section><h2>Daily gross booking value</h2>${dailyTable}</section><section><h2>Booking source mix</h2>${sourceTable}</section></div><div class="footer">Generated from the selected date-filtered admin report.</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`;
    printWindow.document.open();
    printWindow.document.write(reportHtml);
    printWindow.document.close();
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/admin/owner-commissions').then((response) => response.json()).then((result) => {
      if (!cancelled && result?.success && Array.isArray(result.data)) { setOwnerCommissions(result.data); setOwnerCommissionsLoaded(true); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (activeTab !== 'reports') return;
    let cancelled = false;
    setRevenueReportError('');
    const query = new URLSearchParams({ from: reportFrom, to: reportTo });
    apiFetch(`/api/admin/reports/revenue?${query.toString()}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to load revenue report.');
      if (!cancelled) setRevenueReport(result.data);
    }).catch((error) => { if (!cancelled) setRevenueReportError(error.message || 'Unable to load revenue report.'); });
    return () => { cancelled = true; };
  }, [activeTab, reportFrom, reportTo]);

  const saveOwnerCommission = async (ownerId: string) => {
    const raw = commissionDrafts[ownerId];
    const commissionOverride = raw === '' ? null : Number(raw);
    if (commissionOverride !== null && (!Number.isFinite(commissionOverride) || commissionOverride < 0 || commissionOverride > 100)) {
      showAppAlert('Enter a commission from 0 to 100, or leave blank to use the global rate.');
      return;
    }
    setCommissionSaving(ownerId);
    try {
      const response = await apiFetch(`/api/admin/owners/${encodeURIComponent(ownerId)}/commission`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commissionOverride }) });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to update commission.');
      setOwnerCommissions((previous) => previous.map((item) => String(item.user_id) === ownerId ? { ...item, commission_override: commissionOverride } : item));
      setCommissionDrafts((previous) => { const next = { ...previous }; delete next[ownerId]; return next; });
    } catch (error) { showAppAlert(error instanceof Error ? error.message : 'Unable to update commission.'); }
    finally { setCommissionSaving(null); }
  };
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'player' | 'turf_owner' | 'staff' | 'admin'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'pending_approval' | 'suspended'>('all');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingStatusSavingId, setBookingStatusSavingId] = useState<string | null>(null);
  const bookingsPerPage = 12;

  const filteredUsers = users.filter((u) => {
    const query = userSearchQuery.toLowerCase();
    const matchesSearch =
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      (u.phone && u.phone.toLowerCase().includes(query));
    const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
    const matchesStatus = userStatusFilter === 'all' || u.status === userStatusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });
  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / usersPerPage));
  const paginatedUsers = filteredUsers.slice((userPage - 1) * usersPerPage, userPage * usersPerPage);
  useEffect(() => setUserPage((page) => Math.min(page, userPageCount)), [userPageCount]);
  const filteredBookingsForAdmin = bookings.filter((b) => {
    const query = bookingSearchQuery.trim().toLowerCase();
    if (!query) return true;

    const searchTarget = [
      b.bookingNumber,
      b.customerName,
      b.customerPhone,
      b.turfName,
      b.id,
      b.bookingSource,
      b.status,
    ].filter(Boolean).join(' ').toLowerCase();

    return searchTarget.includes(query);
  });
  const bookingPageCount = Math.max(1, Math.ceil(filteredBookingsForAdmin.length / bookingsPerPage));
  const paginatedBookingsForAdmin = filteredBookingsForAdmin.slice((bookingPage - 1) * bookingsPerPage, bookingPage * bookingsPerPage);
  useEffect(() => setBookingPage((page) => Math.min(page, bookingPageCount)), [bookingPageCount]);
  useEffect(() => setPackageDrafts(settings.featuredPackages || []), [settings.featuredPackages]);

  const saveFeaturedPackages = async (packages: NonNullable<typeof settings.featuredPackages>): Promise<boolean> => {
    if (packages.some((pkg) => !pkg.name.trim() || !Number.isFinite(pkg.price) || pkg.price < 0 || !Number.isInteger(pkg.durationDays) || pkg.durationDays < 1 || !Number.isInteger(pkg.priority) || pkg.priority < 1)) {
      setPackageSaveMessage('Each package needs a name, valid price, duration, and priority.');
      return false;
    }
    setPackageSaveMessage('');
    try {
      await updatePlatformSettings({ featuredPackages: packages });
      setPackageDrafts(packages);
      setPackageSaveMessage('Featured packages saved.');
      return true;
    } catch (error) {
      setPackageSaveMessage(error instanceof Error ? error.message : 'Unable to save featured packages.');
      return false;
    }
  };

  // Approvals State
  const pendingTurfs = turfs.filter((t) => t.status === 'pending_review');
  const pendingOwners = ownerProfiles.filter((p) => p.approvalStatus === 'pending_approval');
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pending');

  // Withdrawal Approval Modal
  const [selectedWdForApproval, setSelectedWdForApproval] = useState<string | null>(null);
  const [payoutRef, setPayoutRef] = useState('');
  const [selectedWdForReject, setSelectedWdForReject] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Settings state
  const [globalComm, setGlobalComm] = useState(settings.globalCommissionRate);
  const [platformFee, setPlatformFee] = useState(settings.platformFeeRate);
  const [monthlySubscriptionAmount, setMonthlySubscriptionAmount] = useState(settings.monthlySubscriptionAmount || 0);
  const [bookingHoldMinutes, setBookingHoldMinutes] = useState(settings.bookingHoldMinutes ?? 10);
  const [autoCheckInEnabled, setAutoCheckInEnabled] = useState(settings.autoCheckInEnabled === true);
  const [autoCompleteEnabled, setAutoCompleteEnabled] = useState(settings.autoCompleteEnabled !== false);
  const [ownerBillingSwitchEnabled, setOwnerBillingSwitchEnabled] = useState(settings.ownerBillingSwitchEnabled === true);
  const [platformFeeEnabled, setPlatformFeeEnabled] = useState(settings.platformFeeEnabled !== false);
  const [gatewayFeeEnabled, setGatewayFeeEnabled] = useState(settings.gatewayFeeEnabled !== false);
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(settings.showFeeBreakdown !== false);
  const [subscriptionOwners, setSubscriptionOwners] = useState<Array<Record<string, unknown>>>([]);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [minWd, setMinWd] = useState(settings.minWithdrawalAmount);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [featureFlagError, setFeatureFlagError] = useState('');
  const [updatingFeatureFlag, setUpdatingFeatureFlag] = useState<string | null>(null);
  const [settingsSubTab, setSettingsSubTab] = useState<'commission' | 'features' | 'packages' | 'gateways' | 'email' | 'backups' | 'danger'>('commission');
  const [backupBusyCategory, setBackupBusyCategory] = useState<'players' | 'owners' | 'admins' | null>(null);
  const [backupError, setBackupError] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [killSwitchPhrase, setKillSwitchPhrase] = useState('');
  const [killSwitchBusy, setKillSwitchBusy] = useState(false);
  const [killSwitchComplete, setKillSwitchComplete] = useState(false);
  const [featPayBkash, setFeatPayBkash] = useState(settings.featuredPaymentInfo?.bkashNumber || '');
  const [featPayNagad, setFeatPayNagad] = useState(settings.featuredPaymentInfo?.nagadNumber || '');
  const [featPayRocket, setFeatPayRocket] = useState(settings.featuredPaymentInfo?.rocketNumber || '');
  const [featPayInstructions, setFeatPayInstructions] = useState(settings.featuredPaymentInfo?.instructions || '');
  const [featRejectId, setFeatRejectId] = useState<string | null>(null);
  const [featRejectReason, setFeatRejectReason] = useState('');
  const featureFlags = settings.featureFlags ?? {
    addons_enabled: false,
    squad_enabled: false,
    tournament_enabled: false,
    featured_turf_enabled: false,
    featured_addon_enabled: false,
    whatsapp_enabled: false,
    trending_enabled: false,
    near_you_enabled: false,
  };

  const featureFlagDefinitions = [
    { key: 'addons_enabled', label: 'Booking Add-ons', description: 'Optional add-on selection' },
    { key: 'squad_enabled', label: 'Squad / Matchmaking', description: 'Open matches and squads' },
    { key: 'tournament_enabled', label: 'Tournament Module', description: 'Tournament features' },
    { key: 'featured_turf_enabled', label: 'Featured Turf Listing', description: 'Paid promotional placement' },
    { key: 'featured_addon_enabled', label: 'Featured Add-on Listing', description: 'Reserved for Phase 3' },
    { key: 'whatsapp_enabled', label: 'WhatsApp Integration', description: 'Reserved for future' },
    { key: 'trending_enabled', label: 'Trending Now', description: 'Home discovery module' },
    { key: 'near_you_enabled', label: 'Near You', description: 'Location discovery' },
  ] as const;

  const toggleFeatureFlag = async (key: keyof NonNullable<typeof settings.featureFlags>) => {
    setFeatureFlagError('');
    setUpdatingFeatureFlag(key);
    try {
      const value = !featureFlags[key];
      const response = await apiFetch(`/api/admin/feature-flags/${encodeURIComponent(String(key))}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to update this feature flag.');
      await updatePlatformSettings({ featureFlags: { ...featureFlags, [key]: value } });
    } catch (error) {
      setFeatureFlagError(error instanceof Error ? error.message : 'Unable to update this feature flag.');
    } finally {
      setUpdatingFeatureFlag(null);
    }
  };

  // Payment Gateway Management (admin-configurable, sandbox-friendly)
  const paymentGateways = settings.paymentGateways || EMPTY_PAYMENT_GATEWAY_CONFIGS;
  const [gatewayDrafts, setGatewayDrafts] = useState<PaymentGatewayConfig[]>(paymentGateways);
  const [gatewaySaveStatus, setGatewaySaveStatus] = useState('');
  const [savingGateways, setSavingGateways] = useState(false);
  const [publicApiBaseUrl, setPublicApiBaseUrl] = useState('');
  const [publicApiBaseUrlStatus, setPublicApiBaseUrlStatus] = useState('');
  const [savingPublicApiBaseUrl, setSavingPublicApiBaseUrl] = useState(false);
  useEffect(() => setGatewayDrafts(paymentGateways), [paymentGateways]);
  useEffect(() => {
    let cancelled = false;
    const loadPublicApiBaseUrl = async () => {
      try {
        const response = await apiFetch('/api/admin/settings');
        const result = await response.json();
        if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to load the public API URL.');
        if (!cancelled) setPublicApiBaseUrl(String(result.data?.public_api_base_url || ''));
      } catch {
        if (!cancelled) setPublicApiBaseUrlStatus('Unable to load the current public API URL.');
      }
    };
    void loadPublicApiBaseUrl();
    return () => { cancelled = true; };
  }, []);

  const savePublicApiBaseUrl = async () => {
    setSavingPublicApiBaseUrl(true);
    setPublicApiBaseUrlStatus('');
    try {
      const response = await apiFetch('/api/admin/settings/public_api_base_url', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: publicApiBaseUrl }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to save the public API URL.');
      const savedUrl = String(result.data?.value || '');
      setPublicApiBaseUrl(savedUrl);
      setGatewayDrafts((previous) => previous.map((gateway) => gateway.provider === 'surjopay'
        ? { ...gateway, ipnUrl: `${savedUrl}/api/payments/surjopay/webhook` }
        : gateway));
      setPublicApiBaseUrlStatus('Public API URL saved.');
    } catch (error) {
      setPublicApiBaseUrlStatus(error instanceof Error ? error.message : 'Unable to save the public API URL.');
    } finally { setSavingPublicApiBaseUrl(false); }
  };

  const gatewayProviderLabels: Record<PaymentGatewayProvider, string> = {
    sslcommerz: 'SSLCommerz',
    surjopay: 'SurjoPay',
    uddoktapay: 'UddoktaPay',
  };

  const updateGateway = (id: string, updates: Partial<PaymentGatewayConfig>) => {
    setGatewaySaveStatus('');
    setGatewayDrafts((previous) => previous.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  };

  const savePaymentGateways = async () => {
    setSavingGateways(true);
    setGatewaySaveStatus('');
    try {
      await updatePlatformSettings({ paymentGateways: gatewayDrafts });
      setGatewaySaveStatus('Payment gateway settings saved.');
    } catch (error) {
      setGatewaySaveStatus(error instanceof Error ? error.message : 'Unable to save payment gateway settings.');
    } finally { setSavingGateways(false); }
  };

  // SMTP / Email Configuration — supports multiple servers, admin can add/edit/delete/activate any of them
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>(settings.smtpConfigs || EMPTY_SMTP_CONFIGS);
  const [savingSmtpConfigs, setSavingSmtpConfigs] = useState(false);
  const [smtpSaveStatus, setSmtpSaveStatus] = useState('');
  useEffect(() => setSmtpConfigs(settings.smtpConfigs || EMPTY_SMTP_CONFIGS), [settings.smtpConfigs]);
  const [smtpTestEmailByConfig, setSmtpTestEmailByConfig] = useState<Record<string, string>>({});
  const [smtpTestStatusByConfig, setSmtpTestStatusByConfig] = useState<Record<string, string>>({});
  const [sendingTestConfigId, setSendingTestConfigId] = useState<string | null>(null);

  const updateSmtpConfig = (id: string, updates: Partial<SmtpConfig>) => {
    setSmtpConfigs((current) => current.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const addSmtpConfig = () => {
    const newConfig: SmtpConfig = {
      id: `smtp-${Date.now()}`,
      label: 'New SMTP Server',
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      fromName: 'TurfySlot',
      fromEmail: '',
      isActive: false,
    };
    setSmtpConfigs((current) => [...current, newConfig]);
  };

  const removeSmtpConfig = (id: string) => {
    setSmtpConfigs((current) => current.filter((c) => c.id !== id));
  };

  const setActiveSmtpConfig = (id: string) => {
    setSmtpConfigs((current) => current.map((c) => ({ ...c, isActive: c.id === id })));
  };

  const saveSmtpSettings = async () => {
    setSavingSmtpConfigs(true);
    setSmtpSaveStatus('');
    try {
      await updatePlatformSettings({ smtpConfigs });
      setSmtpSaveStatus('SMTP settings saved securely.');
    } catch (error) {
      setSmtpSaveStatus(error instanceof Error ? error.message : 'Unable to save SMTP settings.');
    } finally { setSavingSmtpConfigs(false); }
  };

  const runDatabaseKillSwitch = async () => {
    if (killSwitchPhrase !== 'WIPE DATABASE' || killSwitchBusy) return;
    if (!window.confirm('This permanently deletes all application data in the configured database except admin accounts and schema metadata. Uploaded files will remain. Continue?')) return;
    setKillSwitchBusy(true);
    try {
      const response = await apiFetch('/api/admin/database-kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: killSwitchPhrase }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('The API server returned a web page instead of JSON. Restart or redeploy the backend so it loads the database kill-switch route, then try again.');
      }
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to wipe application data.');
      setKillSwitchComplete(true);
      window.setTimeout(() => window.location.reload(), 1800);
    } catch (error) {
      setKillSwitchBusy(false);
      showAppAlert(error instanceof Error ? error.message : 'Unable to wipe application data.');
    }
  };

  const handleSendSmtpTest = async (config: SmtpConfig) => {
    const toEmail = (smtpTestEmailByConfig[config.id] || '').trim();
    if (!toEmail) {
      setSmtpTestStatusByConfig((prev) => ({ ...prev, [config.id]: 'Enter a recipient email to send the test to.' }));
      return;
    }
    setSendingTestConfigId(config.id);
    setSmtpTestStatusByConfig((prev) => ({ ...prev, [config.id]: '' }));
    try {
      const response = await apiFetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail, configId: config.id }),
      });
      const data = await response.json();
      setSmtpTestStatusByConfig((prev) => ({
        ...prev,
        [config.id]: data.message || (data.success ? 'Test email sent.' : 'Failed to send test email.'),
      }));
    } catch (error) {
      setSmtpTestStatusByConfig((prev) => ({
        ...prev,
        [config.id]: 'Could not reach the backend (server.js). Is it running on port 5000?',
      }));
    } finally {
      setSendingTestConfigId(null);
    }
  };

  // Policy Simulator State (Section 47)
  const [simTurfId, setSimTurfId] = useState(turfs[0]?.id || 'turf-1');
  const [simPrice, setSimPrice] = useState(1000);
  const [simHoursSinceBooking, setSimHoursSinceBooking] = useState(18); // e.g. 18 hours after booking creation
  const [simBookingSource, setSimBookingSource] = useState<BookingSource>('online');

  // Calculate Policy Simulation (Section 10.3 & 47)
  const calculateSimulation = () => {
    const turf = turfs.find((t) => t.id === simTurfId);
    const policy = cancellationPolicies.find((p) => p.id === turf?.cancellationPolicyId) || cancellationPolicies[0] || {
      id: 'default-simulation-policy',
      name: 'Standard',
      isDefault: true,
      description: '',
      tiers: [
        { id: 'default-simulation-tier-0', minHoursBefore: 0, maxHoursBefore: 6, refundPercentage: 0, description: '' },
        { id: 'default-simulation-tier-1', minHoursBefore: 6, maxHoursBefore: 24, refundPercentage: 50, description: '' },
        { id: 'default-simulation-tier-2', minHoursBefore: 24, refundPercentage: 100, description: '' },
      ],
    };

    // Find tier
    let tier = policy.tiers.find(
      (t) => simHoursSinceBooking >= t.minHoursBefore && (simHoursSinceBooking < (t.maxHoursBefore ?? 99999) || (simHoursSinceBooking === 24 && t.minHoursBefore === 6 && t.maxHoursBefore === 24))
    );
    if (!tier && simHoursSinceBooking >= 24) tier = policy.tiers.find((t) => t.minHoursBefore >= 24);
    if (!tier) tier = policy.tiers[policy.tiers.length - 1];

    const refundPercent = tier?.refundPercentage ?? 0;
    const baseAmount = simPrice;
    const platformFeeAmt = Math.round(baseAmount * (settings.platformFeeRate / 100));
    const gatewayFeeAmt = simBookingSource === 'online' ? Math.round((baseAmount + platformFeeAmt) * (settings.gatewayFeeRate / 100)) : 0;
    const totalPaid = baseAmount + platformFeeAmt + gatewayFeeAmt;

    let playerRefund = 0;
    let adminKeep = platformFeeAmt;

    if (simBookingSource === 'online') {
      playerRefund = Math.round((baseAmount * refundPercent) / 100);
    } else {
      playerRefund = Math.max(0, Math.round((baseAmount * refundPercent) / 100) - platformFeeAmt);
    }

    return {
      policyName: policy.name,
      matchedTier: tier?.description || `${refundPercent}% Refund Tier`,
      refundPercent,
      baseAmount,
      platformFeeAmt,
      gatewayFeeAmt,
      totalPaid,
      playerRefund,
      adminKeep,
      gatewayFeeKeptBySSL: gatewayFeeAmt,
    };
  };

  const simResult = calculateSimulation();

  // Metrics Calculation
  const grossValueBookings = bookings.filter((booking) => ['confirmed', 'checked_in', 'completed', 'partially_refunded'].includes(booking.status));
  const totalGrossBookingValue = grossValueBookings.reduce((acc, booking) => acc + booking.baseAmount, 0);
  const totalCommissionEarned = grossValueBookings.reduce((acc, booking) => acc + booking.commissionAmount, 0);
  const totalPlatformFees = grossValueBookings.reduce((acc, booking) => acc + booking.platformFeeAmount, 0);
  const totalBookings = bookings.length;
  const completedBookings = bookings.filter((b) => ['confirmed', 'checked_in', 'completed'].includes(b.status)).length;
  const cancelledBookings = bookings.filter((b) => ['cancelled', 'refunded'].includes(b.status)).length;
  const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;
  const avgBookingValue = grossValueBookings.length > 0 ? totalGrossBookingValue / grossValueBookings.length : 0;
  const netOwnerEarnings = grossValueBookings.reduce((acc, b) => acc + b.netOwnerAmount, 0);

  const sourceBreakdown = Object.entries(
    grossValueBookings.reduce((acc, b) => {
      acc[b.bookingSource] = (acc[b.bookingSource] || 0) + b.baseAmount;
      return acc;
    }, {} as Record<string, number>)
  )
    .map(([source, total]) => ({ source, total: Number(total) }))
    .sort((a, b) => b.total - a.total);

  const turfRevenueMap = grossValueBookings.reduce((acc, b) => {
    acc[b.turfName] = (acc[b.turfName] || 0) + b.netOwnerAmount;
    return acc;
  }, {} as Record<string, number>);

  const topTurfs = Object.entries(turfRevenueMap)
    .map(([name, total]) => ({
      name,
      total: Number(total),
      bookings: bookings.filter((b) => b.turfName === name).length,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const maxTopTurfValue = topTurfs.length > 0 ? Math.max(...topTurfs.map((t) => t.total)) : 1;

  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const key = getBDDateString(-(6 - index));
    const date = new Date(`${key}T00:00:00`);

    return {
      key,
      label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      value: grossValueBookings
        .filter((b) => b.date === key)
        .reduce((sum, b) => sum + b.baseAmount, 0),
    };
  });

  const maxDailyRevenue = Math.max(...recentDays.map((day) => day.value), 1);
  const reportSummary = (revenueReport?.summary || {}) as Record<string, unknown>;
  const reportNumber = (value: unknown) => Number(value || 0);
  const reportGrossValue = reportNumber(reportSummary.gross_turf_revenue);
  const reportPlatformRevenue = reportNumber(reportSummary.platform_revenue);
  const reportNetOwnerEarnings = reportNumber(reportSummary.net_owner_earnings);
  const reportBookingCount = reportNumber(reportSummary.booking_count);
  const reportGrossBookingCount = reportNumber(reportSummary.gross_booking_count);
  const reportCancellationRate = reportNumber(reportSummary.cancellation_rate);
  const reportSources = ((revenueReport?.sourceBreakdown || []) as Array<Record<string, unknown>>)
    .map((row) => ({ source: String(row.source || 'online'), total: reportNumber(row.total) }))
    .sort((a, b) => b.total - a.total);
  const reportDays = ((revenueReport?.dailyTrend || []) as Array<Record<string, unknown>>)
    .map((row) => ({ key: String(row.date || '').slice(0, 10), value: reportNumber(row.gross_turf_revenue) }))
    .filter((row) => row.key)
    .slice(-7)
    .map((day) => ({ ...day, label: new Date(`${day.key}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }));
  const reportTurfs = ((revenueReport?.byTurf || []) as Array<Record<string, unknown>>)
    .map((row) => ({ name: String(row.turf_name || 'Turf'), total: reportNumber(row.net_owner_earnings), bookings: reportNumber(row.booking_count) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const maxReportTurfEarnings = Math.max(...reportTurfs.map((turf) => turf.total), 1);
  const maxReportDailyRevenue = Math.max(...reportDays.map((day) => day.value), 1);
  const recentBookings = bookings.slice(0, 6);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsSaved(false);
    setSettingsSaveError('');
    try {
      await updatePlatformSettings({
        globalCommissionRate: Number(globalComm),
        platformFeeRate: Number(platformFee),
        minWithdrawalAmount: Number(minWd),
        monthlySubscriptionAmount: Number(monthlySubscriptionAmount),
        bookingHoldMinutes: Number(bookingHoldMinutes),
        autoCheckInEnabled,
        autoCompleteEnabled,
        ownerBillingSwitchEnabled,
        platformFeeEnabled,
        gatewayFeeEnabled,
        showFeeBreakdown,
      });
      setSettingsSaved(true);
      window.setTimeout(() => setSettingsSaved(false), 3000);
    } catch (error) {
      setSettingsSaveError(error instanceof Error ? error.message : 'Unable to save platform settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleAdminBookingStatus = async (bookingId: string, status: 'checked_in' | 'completed') => {
    setBookingStatusSavingId(bookingId);
    try {
      const result = await updateAdminBookingStatus(bookingId, status);
      if (!result.success) showAppAlert(result.message);
    } finally { setBookingStatusSavingId(null); }
  };

  const downloadAdminBackup = async (category: 'players' | 'owners' | 'admins') => {
    setBackupBusyCategory(category);
    setBackupError('');
    setBackupMessage('');
    try {
      const response = await apiFetch(`/api/admin/backups/${category}`);
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || 'Unable to create this backup.');
      }
      const file = await response.blob();
      if (!file.size || !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The server returned an invalid backup file.');
      }
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `turfyslot-${category}-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setBackupMessage(`${category === 'players' ? 'Player' : category === 'owners' ? 'Turf owner' : 'Admin'} backup downloaded.`);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Unable to create this backup.');
    } finally { setBackupBusyCategory(null); }
  };

  useEffect(() => {
    if (activeTab !== 'settings') return;
    let cancelled = false;
    apiFetch('/api/admin/subscriptions').then((response) => response.json()).then((result) => {
      if (!cancelled && result?.success && Array.isArray(result.data)) setSubscriptionOwners(result.data);
    }).catch(() => { if (!cancelled) setSubscriptionError('Unable to load subscription owners.'); });
    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'settings') return;
    let cancelled = false;
    apiFetch('/api/admin/settings').then((response) => response.json()).then((result) => {
      if (!cancelled && result?.success) {
        setMonthlySubscriptionAmount(Number(result.data?.monthly_subscription_amount ?? 0));
        setBookingHoldMinutes(Number(result.data?.booking_hold_minutes ?? 10));
        setAutoCheckInEnabled(result.data?.booking_auto_checkin_enabled === true);
        setAutoCompleteEnabled(result.data?.booking_auto_complete_enabled !== false);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'legal_pages') return;
    let cancelled = false;
    setLegalPagesLoading(true);
    setLegalPagesError('');
    apiFetch('/api/admin/legal-pages')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result?.success || !result.data?.pages) {
          throw new Error(result?.message || 'Unable to load legal pages.');
        }
        if (!cancelled) setLegalPages(result.data.pages);
      })
      .catch((error) => {
        if (!cancelled) setLegalPagesError(error instanceof Error ? error.message : 'Unable to load legal pages.');
      })
      .finally(() => { if (!cancelled) setLegalPagesLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  const saveLegalPages = async () => {
    if (!legalPages || legalPagesSaving) return;
    setLegalPagesSaving(true);
    setLegalPagesError('');
    setLegalPagesMessage('');
    try {
      const response = await apiFetch('/api/admin/legal-pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: legalPages }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success || !result.data?.pages) {
        throw new Error(result?.message || 'Unable to save legal pages.');
      }
      setLegalPages(result.data.pages);
      setLegalPagesMessage(legalPages[legalPageSelection].published
        ? 'Changes saved and published.'
        : 'Draft saved. This page is not visible to the public.');
    } catch (error) {
      setLegalPagesError(error instanceof Error ? error.message : 'Unable to save legal pages.');
    } finally {
      setLegalPagesSaving(false);
    }
  };

  const recordSubscriptionPayment = async (ownerId: string) => {
    const reference = (await showAppPrompt('Enter the offline subscription payment receipt/reference:'))?.trim();
    if (!reference) return;
    try {
      const response = await apiFetch(`/api/admin/subscriptions/${encodeURIComponent(ownerId)}/payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to record subscription payment.');
      const updated = await apiFetch('/api/admin/subscriptions').then((item) => item.json());
      if (updated?.success && Array.isArray(updated.data)) setSubscriptionOwners(updated.data);
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : 'Unable to record subscription payment.');
    }
  };

  return (
    <div className="min-h-screen bg-[#07130c] text-slate-100 pb-16">
      {/* Header */}
      <div className="bg-[#0A1E14] border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] border border-[#C8FF5E]/30">
                  Platform Operations Console
                </span>
                <span className="text-xs text-white/60">Master Governance</span>
              </div>
              <h1 className="text-2xl font-black text-white mt-1">System Administration & Oversight</h1>
            </div>
          </div>

          {/* Navigation Tabs - Seamless full width with flex-wrap and zero scrollbars */}
          <div className="mt-5 flex items-center gap-1.5 bg-white/[0.04] p-1.5 rounded-2xl border border-white/10 flex-wrap no-scrollbar">
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'approvals' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approvals</span>
              {pendingTurfs.length + pendingOwners.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#0A1E14] text-[#C8FF5E] text-[10px] font-bold flex items-center justify-center">
                  {pendingTurfs.length + pendingOwners.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'users' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Users ({users.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('withdrawals')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'withdrawals' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Withdrawals</span>
              {pendingWithdrawals.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#0A1E14] text-emerald-400 text-[10px] font-bold flex items-center justify-center">
                  {pendingWithdrawals.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('policy_engine')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'policy_engine' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Policy Engine</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'settings' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Settings & Commission</span>
            </button>

            <button
              onClick={() => setActiveTab('legal_pages')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'legal_pages' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Legal Pages</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'reports' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Reports & Analytics</span>
            </button>

            <button
              onClick={() => setActiveTab('bookings')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'bookings' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>All Bookings ({bookings.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('disputes')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'disputes' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Disputes</span>
              {disputes.filter((d) => d.status === 'pending').length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#0A1E14] text-amber-300 text-[10px] font-bold flex items-center justify-center">
                  {disputes.filter((d) => d.status === 'pending').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('tournaments')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'tournaments' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Tournaments</span>
            </button>
          </div>

          {/* Platform Revenue KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Gross Booking Value</div>
              <div className="text-xl font-black text-white mt-1">৳{totalGrossBookingValue.toLocaleString()}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
                <div className="text-[10px] text-white/50 font-medium uppercase">Legacy Owner Commission</div>
              <div className="text-xl font-black text-[#C8FF5E] mt-1">৳{totalCommissionEarned.toLocaleString()}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Platform Service Fees</div>
              <div className="text-xl font-black text-emerald-400 mt-1">৳{totalPlatformFees.toLocaleString()}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Active Turfs</div>
              <div className="text-xl font-black text-white mt-1">{turfs.filter((t) => t.status === 'active').length}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Registered Users</div>
              <div className="text-xl font-black text-white mt-1">{users.length}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Pending Approvals</div>
              <div className="text-xl font-black text-amber-400 mt-1">
                {pendingTurfs.length + pendingOwners.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* TAB 1: APPROVALS QUEUE */}
        {activeTab === 'approvals' && (
          <div className="space-y-8">
            {/* Section A: Turf Owner Account Approvals */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#C8FF5E]" /> Turf Owner Account Review Queue ({pendingOwners.length})
                </h3>
              </div>
              <p className="text-xs text-white/60">
                Owners cannot list turfs or receive player funds until approved by platform admin.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingOwners.map((p) => {
                  const ownerUser = users.find((u) => u.id === p.userId);
                  return (
                    <div key={p.id} className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 space-y-3 shadow-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-white text-base">{p.businessName}</h4>
                          <p className="text-xs text-white/60">
                            Owner: {ownerUser?.name} ({ownerUser?.email})
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-amber-950/60 text-amber-300 border border-amber-500/40">
                          {p.approvalStatus.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="bg-[#07130c] border border-white/10 p-3 rounded-xl text-xs space-y-1">
                        {p.reviewMessage && <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-2 text-amber-100"><span className="font-bold">Requested update:</span> {p.reviewMessage}</div>}
                        <div>
                          <span className="text-white/60">Trade License / NID:</span>{' '}
                          <span className="font-mono text-[#C8FF5E]">{p.nidOrTradeLicense}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Contact email:</span>{' '}
                          <span className="text-white">{ownerUser?.email || 'Not provided'}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Trade license document:</span>{' '}
                          {p.businessVerificationDocuments?.length ? (
                            <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
                              {p.businessVerificationDocuments.map((document, index) => (
                                document.dataUrl ? (
                                  <button
                                    key={`${document.fileName}-${index}`}
                                    type="button"
                                    onClick={() => void openOwnerDocumentPreview(document)}
                                    className="font-semibold text-[#C8FF5E] underline"
                                  >
                                    View {document.fileName} ({document.documentType === 'trade_license' ? 'Trade license' : 'Supporting document'})
                                  </button>
                                ) : (
                                  <span key={`${document.fileName}-${index}`} className="text-rose-300">Could not load {document.fileName}. Refresh the review queue to retry.</span>
                                )
                              ))}
                            </span>
                          ) : (
                            <span className="text-rose-300">Not submitted</span>
                          )}
                        </div>
                        <div>
                          <span className="text-white/60">Payout Method:</span>{' '}
                          <span className="capitalize text-white">{p.payoutMethod.replace('_', ' ')}</span> (
                          {p.payoutDetails.accountNumber})
                        </div>
                        {p.payoutDetails.bankName && (
                          <div>
                            <span className="text-white/60">Bank:</span>{' '}
                            <span className="text-white">
                              {p.payoutDetails.bankName} - {p.payoutDetails.branchName}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => { setCorrectionOwner(p.userId); setCorrectionMessage(p.reviewMessage || ''); }}
                          className="flex-1 py-2 bg-amber-950/40 hover:bg-amber-900/60 text-amber-200 border border-amber-800/40 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                        >Request Update</button>
                        <button
                          onClick={() => rejectOwner(p.userId)}
                          className="flex-1 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => approveOwner(p.userId)}
                          disabled={!p.businessVerificationDocuments?.some((document) => document.documentType === 'trade_license') || !p.nidOrTradeLicense.trim()}
                          title={!p.businessVerificationDocuments?.some((document) => document.documentType === 'trade_license') ? 'A trade license document is required before approval.' : undefined}
                          className="flex-1 py-2 bg-[#C8FF5E] hover:bg-[#A8E63E] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#C8FF5E] text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve & Activate
                        </button>
                      </div>
                    </div>
                  );
                })}

                {pendingOwners.length === 0 && (
                  <div className="col-span-full py-8 text-center bg-[#0A1E14] border border-white/10 rounded-2xl text-white/50 text-xs">
                    No pending turf owner accounts. All accounts are up to date.
                  </div>
                )}
              </div>
            </div>

            {/* Section B: Turf Listing Approvals */}
            <div className="space-y-3 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#C8FF5E]" /> Turf Ground Listing Approvals ({pendingTurfs.length})
                </h3>
              </div>
              <p className="text-xs text-white/60">
                Verify turf facilities, lighting, pricing, and photos before listing publicly.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {pendingTurfs.map((turf) => (
                  <div key={turf.id} className="bg-[#0A1E14] border border-white/10 rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg">
                    <div className="relative h-44 bg-[#07130c]">
                      <img src={turf.photos[0] || 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=85'} alt={turf.name} className="w-full h-full object-cover" />
                      <span className="absolute top-3 left-3 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                        Pending Review
                      </span>
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="font-bold text-white text-base">{turf.name}</h4>
                        <p className="text-xs text-white/60 mt-0.5">By {turf.ownerName}</p>
                        <p className="text-xs text-white/70 mt-2 line-clamp-2">{turf.description}</p>
                        <div className="text-xs font-semibold text-[#C8FF5E] mt-2">
                          ৳{turf.basePricePerHour}/hr • {turf.area}, {turf.city}
                        </div>
                        {(turfCorrectionMessages[turf.id] || turf.correctionMessage) && (
                          <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-2 text-xs text-amber-100">
                            Correction requested: {turfCorrectionMessages[turf.id] || turf.correctionMessage}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                        <button
                          onClick={() => void requestTurfCorrections(turf.id)}
                          className="w-full py-2 bg-amber-300/10 hover:bg-amber-300/20 text-amber-100 border border-amber-300/25 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                        >
                          Request Corrections
                        </button>
                        <button
                          onClick={() => rejectTurf(turf.id)}
                          className="flex-1 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => approveTurf(turf.id)}
                          className="flex-1 py-2 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                        >
                          Approve Turf
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {pendingTurfs.length === 0 && (
                  <div className="col-span-full py-8 text-center bg-[#0A1E14] border border-white/10 rounded-2xl text-white/50 text-xs">
                    No turfs in the pending approval queue.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-300" /> Turf Removal Requests ({turfRemovalRequests.length})
                </h3>
              </div>
              <p className="text-xs text-white/60">Requested turfs are hidden immediately and remain available for review before permanent removal.</p>
              {turfRemovalLoading ? <p className="py-5 text-center text-xs text-white/50">Loading removal requests…</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {turfRemovalRequests.map((request) => (
                    <div key={String(request.id)} className="rounded-xl border border-white/10 bg-[#0A1E14] p-4">
                      <h4 className="font-bold text-white">{String(request.turf_name || 'Turf')}</h4>
                      <p className="mt-1 text-xs text-white/60">Requested by {String(request.owner_name || 'Owner')}</p>
                      <p className="mt-2 text-xs text-white/75">{String(request.reason || 'No reason supplied.')}</p>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => void decideTurfRemoval(String(request.id), 'reject')} className="flex-1 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-200">Reject and restore</button>
                        <button onClick={() => void decideTurfRemoval(String(request.id), 'approve')} className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">Approve permanent removal</button>
                      </div>
                    </div>
                  ))}
                  {!turfRemovalRequests.length && <p className="col-span-full rounded-xl border border-white/10 bg-[#0A1E14] py-6 text-center text-xs text-white/50">No pending turf removal requests.</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1.5: USER DIRECTORY & ROLE MANAGEMENT (SECTION 9.1) */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#C8FF5E]" /> Platform User Accounts & Access Control
                </h2>
                <p className="text-xs text-white/60 mt-1">
                  Manage all players, turf owners, operational staff, and system admins. View status, suspend, or reactivate accounts.
                </p>
              </div>

              {/* Summary Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#0A1E14] text-[#C8FF5E] border border-[#C8FF5E]/30">
                  Total: {users.length}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#0A1E14] text-emerald-400 border border-emerald-500/30">
                  Active: {users.filter((u) => u.status === 'active').length}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#0A1E14] text-amber-300 border border-amber-500/30">
                  Pending: {users.filter((u) => u.status === 'pending_approval').length}
                </span>
                {users.filter((u) => u.status === 'suspended').length > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-950/40 text-rose-300 border border-rose-500/30">
                    Suspended: {users.filter((u) => u.status === 'suspended').length}
                  </span>
                )}
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-[#0A1E14] border border-white/10 p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search user by name, email, or phone..."
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                />
              </div>

              {/* Role Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap no-scrollbar pb-1 md:pb-0">
                {(['all', 'player', 'turf_owner', 'staff', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setUserRoleFilter(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      userRoleFilter === r
                        ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20'
                        : 'bg-[#07130c] text-white/70 hover:text-white border border-white/10'
                    }`}
                  >
                    {r === 'all' ? 'All Roles' : r.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                {(['all', 'active', 'pending_approval', 'suspended'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setUserStatusFilter(s)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      userStatusFilter === s
                        ? 'bg-white/20 text-white border border-white/30'
                        : 'bg-[#07130c] text-white/50 hover:text-white/80 border border-white/10'
                    }`}
                  >
                    {s === 'all' ? 'All Status' : s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Users List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedUsers.map((u) => {
                const ownerP = ownerProfiles.find((op) => op.userId === u.id);
                const userBookings = bookings.filter((b) => b.playerId === u.id);
                const ownerTurfs = turfs.filter((t) => t.ownerId === u.id);

                return (
                  <div
                    key={u.id}
                    className="bg-[#0A1E14] border border-white/10 hover:border-[#C8FF5E]/30 transition-all rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xl"
                  >
                    <div className="space-y-3">
                      {/* Top row: Avatar + Name + Status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                            alt={u.name}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-white/10"
                          />
                          <div>
                            <h4 className="font-bold text-white text-sm leading-tight">{u.name}</h4>
                            <p className="text-xs text-white/50 truncate max-w-[180px]">{u.email}</p>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            u.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : u.status === 'suspended'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {u.status.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Role & Context Info */}
                      <div className="bg-[#07130c] p-3 rounded-xl text-xs space-y-1.5 border border-white/5">
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Platform Role:</span>
                          <span className="font-bold text-[#C8FF5E] uppercase tracking-wider text-[10px]">
                            {u.role.replace('_', ' ')}
                          </span>
                        </div>
                        {u.phone && (
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Phone:</span>
                            <span className="font-mono text-white/80">{u.phone}</span>
                          </div>
                        )}
                        {u.role === 'turf_owner' && (
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Business:</span>
                            <span className="font-semibold text-white truncate max-w-[150px]">
                              {ownerP?.businessName || 'Unregistered'} ({ownerTurfs.length} Turfs)
                            </span>
                          </div>
                        )}
                        {u.role === 'turf_owner' && (() => {
                          const commission = ownerCommissions.find((item) => String(item.user_id) === u.id);
                          const currentOverride = commission?.commission_override;
                          const draft = commissionDrafts[u.id] ?? (currentOverride == null ? '' : String(currentOverride));
                          return <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="text-white/60">Legacy owner commission override (%) ? does not affect new bookings, which pay the owner the full turf price.</div>
                            <div className="flex gap-2">
                              <input aria-label={`Commission override for ${u.name}`} type="number" min="0" max="100" step="0.01" value={draft} onChange={(event) => setCommissionDrafts((previous) => ({ ...previous, [u.id]: event.target.value }))} placeholder="Global rate" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-1.5 text-white" />
                              <button type="button" disabled={commissionSaving === u.id || !ownerCommissionsLoaded} onClick={() => void saveOwnerCommission(u.id)} className="rounded-lg bg-[#C8FF5E] px-3 py-1.5 font-bold text-[#0A1E14] disabled:opacity-50">{commissionSaving === u.id ? 'Saving?' : ownerCommissionsLoaded ? 'Save' : 'Loading?'}</button>
                            </div>
                          </div>;
                        })()}
                        {u.role === 'player' && (
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Bookings Made:</span>
                            <span className="font-bold text-white">{userBookings.length} bookings</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                      <button
                        onClick={() => toggleUserSuspension(u.id)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          u.status === 'suspended'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow'
                            : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40'
                        }`}
                      >
                        {u.status === 'suspended' ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Reactivate</span>
                          </>
                        ) : (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </>
                        )}
                      </button>

                    </div>
                  </div>
                );
              })}

              {filteredUsers.length === 0 && (
                <div className="col-span-full py-12 text-center bg-[#0A1E14] border border-white/10 rounded-2xl p-6 text-white/50 text-xs">
                  No users match the search and filter criteria.
                </div>
              )}
            </div>
            {filteredUsers.length > usersPerPage && (
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Showing {(userPage - 1) * usersPerPage + 1}–{Math.min(userPage * usersPerPage, filteredUsers.length)} of {filteredUsers.length} users</span>
                <div className="flex gap-2">
                  <button type="button" disabled={userPage <= 1} onClick={() => setUserPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-white/15 px-3 py-2 text-white disabled:opacity-40">Previous</button>
                  <span className="self-center">Page {userPage} of {userPageCount}</span>
                  <button type="button" disabled={userPage >= userPageCount} onClick={() => setUserPage((page) => Math.min(userPageCount, page + 1))} className="rounded-lg border border-white/15 px-3 py-2 text-white disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'withdrawals' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white">Turf Owner Payout Approvals</h2>
                <p className="text-xs text-white/60">
                  Review and manually disburse funds to turf owners via bKash, Nagad, or Bank Transfer.
                </p>
              </div>
            </div>

            <div className="bg-[#0A1E14] border border-white/10 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="bg-[#0e271a] text-white/60 uppercase font-bold text-[10px] border-b border-white/10">
                    <tr>
                      <th className="py-3.5 px-4">Request ID</th>
                      <th className="py-3.5 px-4">Owner & Business</th>
                      <th className="py-3.5 px-4">Amount</th>
                      <th className="py-3.5 px-4">Payout Method & Account</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">{w.id}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{w.ownerName}</div>
                          <div className="text-[11px] text-white/60">{w.businessName}</div>
                        </td>
                        <td className="py-3 px-4 font-black text-[#C8FF5E] text-sm">৳{w.amount.toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <div className="text-white font-medium">{w.payoutMethod}</div>
                          <div className="text-[11px] text-white/60 font-mono">{w.payoutDetails}</div>
                        </td>
                        <td className="py-3 px-4 text-white/60">{formatBDDate(w.createdAt)}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                              w.status === 'paid'
                                ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                                : w.status === 'pending'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                : 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                            }`}
                          >
                            {w.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {w.status === 'pending' ? (
                            <>
                              <button
                                onClick={() => setSelectedWdForReject(w.id)}
                                className="px-2.5 py-1 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 text-xs font-semibold rounded-xl border border-rose-800/40 cursor-pointer transition-colors"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => setSelectedWdForApproval(w.id)}
                                className="px-3 py-1 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] text-xs font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                              >
                                Approve & Pay
                              </button>
                            </>
                          ) : (
                            <span className="font-mono text-[11px] text-white/50">{w.reference || w.rejectionReason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FLEXIBLE CANCELLATION POLICY ENGINE (SECTION 47) */}
        {activeTab === 'policy_engine' && (
          <div className="space-y-6">
            <div className="pb-3 border-b border-white/10">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-[#C8FF5E]" /> Flexible Cancellation Policy Engine & Simulator
              </h2>
              <p className="text-xs text-white/60">
                Resolution Hierarchy: <span className="text-[#C8FF5E] font-semibold">Turf Policy</span> →{' '}
                <span className="text-emerald-400 font-semibold">Owner Policy</span> →{' '}
                <span className="text-amber-400 font-semibold">Standard Platform Default</span>
              </p>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => startPolicyEdit()} className="rounded-xl bg-[#C8FF5E] px-4 py-2 text-xs font-black text-[#0A1E14]">Add Cancellation Policy</button>
            </div>

            {policyDraft && <div className="space-y-4 rounded-2xl border border-[#C8FF5E]/30 bg-[#0A1E14] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-white">{policyDraft.id === '__new__' ? 'New Cancellation Policy' : `Edit ${policyDraft.name}`}</h3>
                <button type="button" onClick={() => { setPolicyDraft(null); setPolicyError(''); }} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70">Close</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-white/70">Policy name
                  <input value={policyDraft.name} onChange={(event) => updatePolicyDraft({ name: event.target.value })} maxLength={100} className="mt-1 w-full rounded-lg border border-white/15 bg-[#07130c] p-2.5 text-white" placeholder="e.g. Standard Policy" />
                </label>
                <label className="text-xs text-white/70">Description
                  <input value={policyDraft.description} onChange={(event) => updatePolicyDraft({ description: event.target.value })} maxLength={1000} className="mt-1 w-full rounded-lg border border-white/15 bg-[#07130c] p-2.5 text-white" placeholder="Describe when this policy should be used" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/80">
                <input type="checkbox" checked={policyDraft.isDefault} onChange={(event) => updatePolicyDraft({ isDefault: event.target.checked })} disabled={policyDraft.isDefault} />
                Set as global default policy
              </label>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-[10px] font-bold uppercase text-white/45"><span>From hours since booking</span><span>Until hours since booking</span><span>Refund %</span><span /></div>
                {[...policyDraft.tiers].sort((a, b) => a.minHoursBefore - b.minHoursBefore).map((tier, index) => (
                  <div key={tier.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                    <input aria-label={`Tier ${index + 1} from hours`} type="number" min="0" step="1" value={tier.minHoursBefore} onChange={(event) => updatePolicyTier(tier.id, { minHoursBefore: Number(event.target.value) })} className="min-w-0 rounded-lg border border-white/15 bg-[#07130c] p-2 text-sm text-white" />
                    <input aria-label={`Tier ${index + 1} until hours`} type="number" min="1" step="1" value={tier.maxHoursBefore ?? ''} onChange={(event) => updatePolicyTier(tier.id, { maxHoursBefore: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="No limit" className="min-w-0 rounded-lg border border-white/15 bg-[#07130c] p-2 text-sm text-white" />
                    <input aria-label={`Tier ${index + 1} refund percentage`} type="number" min="0" max="100" step="1" value={tier.refundPercentage} onChange={(event) => updatePolicyTier(tier.id, { refundPercentage: Number(event.target.value) })} className="min-w-0 rounded-lg border border-white/15 bg-[#07130c] p-2 text-sm text-white" />
                    <button type="button" disabled={policyDraft.tiers.length <= 1} onClick={() => removePolicyTier(index)} className="rounded-lg border border-rose-500/30 px-2 py-2 text-xs text-rose-200 disabled:opacity-30">Remove</button>
                  </div>
                ))}
                <button type="button" disabled={policyDraft.tiers.length >= 20} onClick={addPolicyTier} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Add tier</button>
                <p className="text-[10px] text-white/45">Tiers must start at 0 hours, have contiguous ranges, and leave the final range open-ended.</p>
              </div>
              {policyError && <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2 text-xs text-rose-200">{policyError}</p>}
              <div className="flex justify-end">
                <button type="button" disabled={policySaving} onClick={() => void savePolicyDraft()} className="rounded-xl bg-[#C8FF5E] px-4 py-2 text-xs font-black text-[#0A1E14] disabled:opacity-50">{policySaving ? 'Saving…' : 'Save Policy'}</button>
              </div>
            </div>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Active Policies & Tiers Matrix */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Policy Tier Definitions</h3>

                {cancellationPolicies.map((cp) => (
                  <div key={cp.id} className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{cp.name}</span>
                        {cp.isDefault && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/40">
                            Global Default
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startPolicyEdit(cp)} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] font-bold text-white">Edit</button>
                        {!cp.isDefault && <button type="button" onClick={async () => {
                          if ((await showAppPrompt(`Type DELETE to remove policy “${cp.name}”. Assigned policies cannot be deleted.`, 'DELETE')) !== 'DELETE') return;
                          try { await deleteCancellationPolicy(cp.id); }
                          catch (error) { showAppAlert(error instanceof Error ? error.message : 'Unable to delete cancellation policy.'); }
                        }} className="rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-[10px] font-bold text-rose-200">Delete</button>}
                      </div>
                    </div>
                    <p className="text-xs text-white/60">{cp.description}</p>

                    {/* Tiers list */}
                    <div className="space-y-2 mt-3">
                      {cp.tiers.map((tier) => (
                        <div
                          key={tier.id}
                          className="flex items-center justify-between p-2.5 bg-[#07130c] rounded-xl text-xs border border-white/10"
                        >
                          <div>
                            <span className="font-semibold text-white">
                              {tier.minHoursBefore === 0
                                ? `< ${tier.maxHoursBefore} Hours Since Booking`
                                : tier.maxHoursBefore === 9999 || !tier.maxHoursBefore
                                ? `> ${tier.minHoursBefore} Hours Since Booking`
                                : `${tier.minHoursBefore} - ${tier.maxHoursBefore} Hours Since Booking`}
                            </span>
                            <div className="text-[10px] text-white/50">{tier.description}</div>
                          </div>
                          <span
                            className={`font-black text-xs px-2.5 py-1 rounded-full border ${
                              tier.refundPercentage === 100
                                ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                                : tier.refundPercentage === 50
                                ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                : 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                            }`}
                          >
                            {tier.refundPercentage}% Refund
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Interactive Policy Simulator */}
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 space-y-4 shadow-lg">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#C8FF5E]" /> Interactive Policy Simulator
                </h3>
                <p className="text-xs text-white/60">
                  Simulate cancellation scenarios and verify the resulting refund amounts.
                </p>

                {/* Simulator Controls */}
                <div className="space-y-3 text-xs bg-[#07130c] p-4 rounded-xl border border-white/10">
                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Test Turf:</label>
                    <select
                      value={simTurfId}
                      onChange={(e) => setSimTurfId(e.target.value)}
                      className="w-full bg-[#0A1E14] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                    >
                      {turfs.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (Base ৳{t.basePricePerHour})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-white/80 font-semibold mb-1 block">Base Turf Price (BDT):</label>
                      <input
                        type="number"
                        value={simPrice}
                        onChange={(e) => setSimPrice(Number(e.target.value))}
                        className="w-full bg-[#0A1E14] border border-white/15 rounded-xl p-2.5 text-[#C8FF5E] font-bold focus:border-[#C8FF5E] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-white/80 font-semibold mb-1 block">Hours Since Booking:</label>
                      <input
                        type="number"
                        value={simHoursSinceBooking}
                        onChange={(e) => setSimHoursSinceBooking(Number(e.target.value))}
                        className="w-full bg-[#0A1E14] border border-white/15 rounded-xl p-2.5 text-white font-bold focus:border-[#C8FF5E] outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Booking Channel / Source:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSimBookingSource('online')}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          simBookingSource === 'online'
                            ? 'bg-[#C8FF5E] text-[#0A1E14] font-bold border-[#C8FF5E] shadow-md shadow-[#C8FF5E]/20'
                            : 'bg-[#0A1E14] text-white/60 border-white/10 hover:text-white'
                        }`}
                      >
                        Online (SSLCommerz)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSimBookingSource('manual_owner')}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          simBookingSource === 'manual_owner'
                            ? 'bg-[#C8FF5E] text-[#0A1E14] font-bold border-[#C8FF5E] shadow-md shadow-[#C8FF5E]/20'
                            : 'bg-[#0A1E14] text-white/60 border-white/10 hover:text-white'
                        }`}
                      >
                        Manual / Counter (0 TK Gateway)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Simulation Output Breakdown */}
                <div className="p-4 bg-[#07130c] rounded-xl border border-white/10 text-xs space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-white/60">Resolved Policy:</span>
                    <span className="font-bold text-white">{simResult.policyName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Triggered Tier:</span>
                    <span className="font-bold text-amber-300">{simResult.matchedTier}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Initial Amount Collected:</span>
                    <span className="font-semibold text-white">৳{simResult.totalPaid}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Platform Fee Kept by Admin:</span>
                    <span className="font-semibold text-[#C8FF5E]">৳{simResult.adminKeep}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Gateway Fee (Kept by payment provider):</span>
                    <span className="font-semibold text-white/50">৳{simResult.gatewayFeeKeptBySSL}</span>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                    <span className="text-sm font-bold text-white">Calculated Player Refund:</span>
                    <span className="text-2xl font-black text-[#C8FF5E]">৳{simResult.playerRefund}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SETTINGS & COMMISSIONS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="flex items-center gap-1.5 bg-white/[0.04] p-1.5 rounded-2xl border border-white/10 flex-wrap no-scrollbar">
              {[
                { key: 'commission', label: 'Commission Setup' },
                { key: 'features', label: 'Features Setting' },
                { key: 'packages', label: 'Packages' },
                { key: 'gateways', label: 'Payment Gateways' },
                { key: 'email', label: 'Email / SMTP' },
                { key: 'backups', label: 'Data Backups' },
                { key: 'danger', label: 'Danger Zone' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSettingsSubTab(tab.key as 'commission' | 'features' | 'packages' | 'gateways' | 'email' | 'backups' | 'danger')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    settingsSubTab === tab.key
                      ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20'
                      : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {settingsSubTab === 'commission' && (
              <form onSubmit={handleSaveSettings} className="bg-[#0A1E14] border border-white/10 rounded-2xl p-6 space-y-4 text-xs shadow-lg max-w-2xl">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">
                    Legacy Owner Commission Rate (not deducted from new bookings):
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      value={globalComm}
                      onChange={(e) => setGlobalComm(Number(e.target.value))}
                      className="w-32 bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-[#C8FF5E] font-bold text-sm focus:border-[#C8FF5E] outline-none"
                    />
                    <span className="text-white/50">Legacy value; new bookings pay owners the full turf price.</span>
                  </div>
                </div>

                <div>
                  <label className="text-white/80 font-semibold mb-1 block">
                    Player Platform Service Fee (% added on top of turf price):
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      value={platformFee}
                      onChange={(e) => setPlatformFee(Number(e.target.value))}
                      className="w-32 bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-[#C8FF5E] font-bold text-sm focus:border-[#C8FF5E] outline-none"
                    />
                    <span className="text-white/50">Current default: 5%</span>
                  </div>
                </div>

                <div>
                  <label className="text-white/80 font-semibold mb-1 block">
                    Minimum Turf Owner Withdrawal Amount (BDT):
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={minWd}
                      onChange={(e) => setMinWd(Number(e.target.value))}
                      className="w-32 bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white font-bold text-sm focus:border-[#C8FF5E] outline-none"
                    />
                    <span className="text-white/50">Current minimum: ৳1,000</span>
                  </div>
                </div>

                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Monthly Subscription Amount (BDT):</label>
                  <div className="flex items-center gap-3">
                    <input type="number" min="0" step="1" value={monthlySubscriptionAmount} onChange={(e) => setMonthlySubscriptionAmount(Number(e.target.value))} className="w-32 bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white font-bold text-sm focus:border-[#C8FF5E] outline-none" />
                    <span className="text-white/50">Set above ৳0 to offer subscription billing to new owners.</span>
                  </div>

                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Booking Payment Hold (minutes):</label>
                    <div className="flex items-center gap-3">
                      <input type="number" min="1" max="60" step="1" value={bookingHoldMinutes} onChange={(e) => setBookingHoldMinutes(Number(e.target.value))} className="w-32 bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white font-bold text-sm focus:border-[#C8FF5E] outline-none" />
                      <span className="text-white/50">Players have 1–60 minutes to complete payment before the slot is released.</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-white/10 pt-4">
                  {[
                    { label: 'Charge booking platform fee', value: platformFeeEnabled, onChange: setPlatformFeeEnabled },
                    { label: 'Charge payment gateway fee', value: gatewayFeeEnabled, onChange: setGatewayFeeEnabled },
                    { label: 'Show Transparent Fee Breakdown', value: showFeeBreakdown, onChange: setShowFeeBreakdown },
                    { label: 'Allow owners to switch billing model at renewal', value: ownerBillingSwitchEnabled, onChange: setOwnerBillingSwitchEnabled },
                    { label: 'Automatically check in paid bookings at scheduled start time', value: autoCheckInEnabled, onChange: setAutoCheckInEnabled },
                    { label: 'Automatically complete paid bookings after scheduled end time', value: autoCompleteEnabled, onChange: setAutoCompleteEnabled },
                  ].map((control) => (
                    <div key={control.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#07130c] p-3">
                      <span className="text-xs font-semibold text-white/80">{control.label}</span>
                      <button type="button" aria-pressed={control.value} onClick={() => control.onChange(!control.value)} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase ${control.value ? 'border-[#C8FF5E]/40 bg-[#C8FF5E]/15 text-[#C8FF5E]' : 'border-white/10 bg-white/[0.04] text-white/60'}`}>
                        {control.value ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  ))}
                </div>

                {settingsSaved && (
                  <div className="p-3 bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/40 rounded-xl text-xs font-semibold">
                    Platform settings saved successfully.
                  </div>
                )}
                {settingsSaveError && <p role="alert" className="text-xs font-semibold text-rose-300">{settingsSaveError}</p>}

                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="py-2.5 px-6 bg-[#C8FF5E] hover:bg-[#A8E63E] disabled:cursor-wait disabled:opacity-60 text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 transition-all cursor-pointer"
                >
                  {settingsSaving ? 'Saving...' : 'Save Platform Settings'}
                </button>
              </form>
            )}

            {settingsSubTab === 'commission' && (
              <section className="max-w-4xl rounded-2xl border border-white/10 bg-[#0A1E14] p-6 shadow-lg">
                <div className="mb-4 flex items-start justify-between gap-4 border-b border-white/10 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Monthly Subscription Owners</h3>
                    <p className="mt-1 text-[11px] text-white/60">Record offline payments to clear the current due alert and restore turfs disabled for subscription non-payment.</p>
                  </div>
                  <span className="text-xs font-bold text-[#C8FF5E]">{subscriptionOwners.length} owners</span>
                </div>
                {subscriptionError && <p role="alert" className="mb-3 text-xs text-rose-300">{subscriptionError}</p>}
                <div className="space-y-2">
                  {subscriptionOwners.map((owner) => {
                    const dueDate = String(owner.subscription_due_date || '').slice(0, 10);
                    const overdue = dueDate && new Date(`${dueDate}T00:00:00Z`).getTime() < Date.now() - 5 * 86_400_000;
                    const isActiveOwner = String(owner.approval_status) === 'active';
                    const isSubscriptionOwner = String(owner.billing_model) === 'monthly_subscription';
                    const pendingBillingModel = String(owner.pending_billing_model || '');
                    return (
                      <div key={String(owner.user_id)} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#07130c] p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white">{String(owner.name || 'Owner')} <span className="font-normal text-white/50">· {String(owner.business_name || '')}</span></div>
                          <div className="mt-1 text-[11px] text-white/60">Due {dueDate || 'after approval'} · ৳{Number(owner.subscription_due_amount || monthlySubscriptionAmount).toLocaleString()} · {Number(owner.subscription_disabled_turfs || 0)} subscription-disabled turfs</div>
                          <div className={`mt-1 text-[10px] font-bold uppercase ${overdue ? 'text-rose-300' : 'text-[#C8FF5E]'}`}>{overdue ? 'Payment overdue' : `Paid through ${String(owner.subscription_paid_through || 'not yet')}`}</div>
                          {pendingBillingModel && <div className="mt-1 text-[10px] font-semibold text-sky-200">Switch to {pendingBillingModel.replace('_', ' ')} on {String(owner.billing_model_change_effective_date || 'next renewal').slice(0, 10)}</div>}
                        </div>
                        <button type="button" disabled={!isActiveOwner || !isSubscriptionOwner} onClick={() => void recordSubscriptionPayment(String(owner.user_id))} className="shrink-0 rounded-lg bg-[#C8FF5E] px-3 py-2 text-xs font-bold text-[#0A1E14] disabled:cursor-not-allowed disabled:opacity-40">{!isActiveOwner ? 'Awaiting approval' : isSubscriptionOwner ? 'Record payment' : 'Starts at renewal'}</button>
                      </div>
                    );
                  })}
                  {subscriptionOwners.length === 0 && <p className="py-5 text-center text-xs text-white/50">No subscription-model owners yet.</p>}
                </div>
              </section>
            )}

            {settingsSubTab === 'features' && (
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-6 shadow-lg space-y-4 max-w-3xl">
                <div className="pb-3 border-b border-white/10">
                  <h3 className="text-base font-bold text-white">Feature Flags & Paid Features Listing</h3>
                  <p className="text-[11px] text-white/60 mt-1">
                    All optional features default to OFF. Toggle a module to enable or disable it platform-wide.
                  </p>
                </div>
                {featureFlagError && <p role="alert" className="text-xs text-rose-300">{featureFlagError}</p>}

                <div className="space-y-3">
                  {featureFlagDefinitions.map(({ key, label, description }) => (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#07130c] p-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white">{label}</div>
                        <div className="text-[11px] text-white/60 mt-0.5">{description}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleFeatureFlag(key)}
                        disabled={updatingFeatureFlag === key}
                        aria-pressed={Boolean(featureFlags[key])}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                          featureFlags[key]
                            ? 'bg-[#C8FF5E]/15 text-[#C8FF5E] border-[#C8FF5E]/40'
                            : 'bg-white/[0.04] text-white/70 border-white/10'
                        }`}
                      >
                        {featureFlags[key] ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {settingsSubTab === 'packages' && (
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-6 shadow-lg space-y-4 max-w-4xl">
                <div className="pb-3 border-b border-white/10">
                  <h3 className="text-base font-bold text-white">Featured Packages</h3>
                  <p className="text-[11px] text-white/60 mt-1">
                    Configure the package options owners can request for featured listings.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {packageDrafts.map((pkg, index) => (
                    <div key={pkg.id} className="rounded-xl border border-white/10 bg-[#07130c] p-3 space-y-2">
                      <input aria-label="Package name" value={pkg.name} onChange={(event) => setPackageDrafts((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} className="w-full rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-1.5 text-xs text-white" placeholder="Package name" />
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[10px] text-white/60">Price<input aria-label="Package price" type="number" min="0" value={pkg.price} onChange={(event) => setPackageDrafts((items) => items.map((item, i) => i === index ? { ...item, price: Number(event.target.value) } : item))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-1.5 text-xs text-white" /></label>
                        <label className="text-[10px] text-white/60">Days<input aria-label="Package duration in days" type="number" min="1" step="1" value={pkg.durationDays} onChange={(event) => setPackageDrafts((items) => items.map((item, i) => i === index ? { ...item, durationDays: Number(event.target.value) } : item))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-1.5 text-xs text-white" /></label>
                        <label className="text-[10px] text-white/60">Priority<input aria-label="Package priority" type="number" min="1" step="1" value={pkg.priority} onChange={(event) => setPackageDrafts((items) => items.map((item, i) => i === index ? { ...item, priority: Number(event.target.value) } : item))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-1.5 text-xs text-white" /></label>
                      </div>
                      <input aria-label="Package description" value={pkg.description} onChange={(event) => setPackageDrafts((items) => items.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} className="w-full rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-1.5 text-xs text-white" placeholder="Description" />
                      <button type="button" onClick={() => setPackageDrafts((items) => items.filter((_, i) => i !== index))} className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-[10px] font-bold text-rose-300">Delete package</button>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-white/10 bg-[#07130c] p-3 space-y-2">
                  <h4 className="text-xs font-bold text-white">Create package</h4>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <input aria-label="New package name" value={newPackage.name} onChange={(event) => setNewPackage((draft) => ({ ...draft, name: event.target.value }))} placeholder="Name" className="rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-2 text-xs text-white" />
                    <input aria-label="New package price" type="number" min="0" value={newPackage.price} onChange={(event) => setNewPackage((draft) => ({ ...draft, price: event.target.value }))} placeholder="Price" className="rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-2 text-xs text-white" />
                    <input aria-label="New package duration in days" type="number" min="1" step="1" value={newPackage.durationDays} onChange={(event) => setNewPackage((draft) => ({ ...draft, durationDays: event.target.value }))} placeholder="Days" className="rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-2 text-xs text-white" />
                    <input aria-label="New package priority" type="number" min="1" step="1" value={newPackage.priority} onChange={(event) => setNewPackage((draft) => ({ ...draft, priority: event.target.value }))} placeholder="Priority" className="rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-2 text-xs text-white" />
                    <input aria-label="New package description" value={newPackage.description} onChange={(event) => setNewPackage((draft) => ({ ...draft, description: event.target.value }))} placeholder="Description" className="rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-2 text-xs text-white" />
                  </div>
                  <button type="button" onClick={() => {
                    if (!newPackage.name.trim() || newPackage.price === '' || newPackage.durationDays === '' || newPackage.priority === '') { setPackageSaveMessage('Complete the package name, price, duration, and priority first.'); return; }
                    const pkg = { id: `featured-${Date.now()}`, name: newPackage.name.trim(), price: Number(newPackage.price), durationDays: Number(newPackage.durationDays), priority: Number(newPackage.priority), description: newPackage.description.trim() };
                    void saveFeaturedPackages([...packageDrafts, pkg]).then((saved) => { if (saved) setNewPackage({ name: '', price: '', durationDays: '', priority: '', description: '' }); });
                  }} className="rounded-lg bg-[#C8FF5E] px-3 py-2 text-xs font-bold text-[#0A1E14]">Create package</button>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => void saveFeaturedPackages(packageDrafts)} className="rounded-lg bg-[#C8FF5E] px-3 py-2 text-xs font-bold text-[#0A1E14]">Save package changes</button>
                  {packageSaveMessage && <p role="status" className="text-xs text-white/70">{packageSaveMessage}</p>}
                </div>

                {/* Featured Payment Numbers + Requests Queue */}
                <div className="rounded-2xl border border-white/10 bg-[#07130c] p-4 space-y-3 mt-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">Featured Listing Payment Numbers</h4>
                    <p className="text-[11px] text-white/60 mt-0.5">
                      Owners see these numbers when requesting a Featured package.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-white/60 font-semibold mb-1 block">bKash Number</label>
                      <input
                        type="text"
                        value={featPayBkash}
                        onChange={(e) => setFeatPayBkash(e.target.value)}
                        placeholder="01XXXXXXXXX"
                        className="w-full bg-[#0A1E14] border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono focus:border-[#C8FF5E] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-white/60 font-semibold mb-1 block">Nagad Number</label>
                      <input
                        type="text"
                        value={featPayNagad}
                        onChange={(e) => setFeatPayNagad(e.target.value)}
                        placeholder="01XXXXXXXXX"
                        className="w-full bg-[#0A1E14] border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono focus:border-[#C8FF5E] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-white/60 font-semibold mb-1 block">Rocket (optional)</label>
                      <input
                        type="text"
                        value={featPayRocket}
                        onChange={(e) => setFeatPayRocket(e.target.value)}
                        placeholder="01XXXXXXXXX"
                        className="w-full bg-[#0A1E14] border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono focus:border-[#C8FF5E] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-white/60 font-semibold mb-1 block">Payment Instructions</label>
                    <textarea
                      value={featPayInstructions}
                      onChange={(e) => setFeatPayInstructions(e.target.value)}
                      rows={2}
                      className="w-full bg-[#0A1E14] border border-white/15 rounded-xl p-2.5 text-xs text-white focus:border-[#C8FF5E] outline-none"
                      placeholder="Send Money to bKash. Put turf name in reference. Then submit TxID."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updatePlatformSettings({
                        featuredPaymentInfo: {
                          bkashNumber: featPayBkash.trim(),
                          nagadNumber: featPayNagad.trim(),
                          rocketNumber: featPayRocket.trim(),
                          instructions: featPayInstructions.trim(),
                        },
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs cursor-pointer"
                  >
                    Save Payment Numbers
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#07130c] p-4 space-y-3 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Featured Requests Queue</h4>
                      <p className="text-[11px] text-white/60">
                        Verify owner TxID, then approve to push the turf into Featured placement.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-950/50 text-amber-300 border border-amber-500/30">
                      {
                        featuredRequests.filter(
                          (r) => r.status === 'payment_submitted' || r.status === 'pending_payment'
                        ).length
                      }{' '}
                      open
                    </span>
                  </div>

                  {featuredRequests.length === 0 ? (
                    <p className="text-xs text-white/40 py-4 text-center">No featured requests yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {featuredRequests.map((r) => (
                        <div key={r.id} className="rounded-xl border border-white/10 bg-[#0A1E14] p-3 space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-bold text-white">{r.turfName}</div>
                              <div className="text-[11px] text-white/60 mt-0.5">
                                {r.ownerName} · {r.packageName} · ৳{r.amount.toLocaleString()} · {r.durationDays} days · Priority {r.priority}
                              </div>
                              {r.paymentReference && (
                                <div className="text-[11px] text-[#C8FF5E] font-mono mt-1">
                                  {r.paymentMethod}: {r.paymentReference}
                                </div>
                              )}
                              {r.rejectionReason && (
                                <div className="text-[11px] text-rose-300 mt-1">Reject: {r.rejectionReason}</div>
                              )}
                            </div>
                            <span
                              className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border w-fit ${
                                r.status === 'approved'
                                  ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                                  : r.status === 'payment_submitted'
                                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                  : r.status === 'rejected'
                                  ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                                  : 'bg-white/5 text-white/70 border-white/15'
                              }`}
                            >
                              {r.status.replace('_', ' ')}
                            </span>
                          </div>

                          {(r.status === 'payment_submitted' || r.status === 'pending_payment') && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => approveFeaturedRequest(r.id)}
                                className="px-3 py-1.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-[11px] cursor-pointer"
                              >
                                Approve & Feature Turf  
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFeatRejectId(r.id);
                                  setFeatRejectReason('');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 text-rose-200 border border-rose-800/40 font-bold text-[11px] cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          )}

                          {featRejectId === r.id && (
                            <div className="flex gap-2 items-center">
                              <input
                                type="text"
                                value={featRejectReason}
                                onChange={(e) => setFeatRejectReason(e.target.value)}
                                placeholder="Rejection reason"
                                className="flex-1 bg-[#07130c] border border-white/15 rounded-xl p-2 text-xs text-white outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  rejectFeaturedRequest(r.id, featRejectReason || 'Payment not verified', false);
                                  setFeatRejectId(null);
                                }}
                                className="px-3 py-2 rounded-xl bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Confirm Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {settingsSubTab === 'gateways' && (
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-6 shadow-lg space-y-4 max-w-4xl">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div>
                    <h3 className="text-base font-bold text-white">Payment Gateway Configuration</h3>
                    <p className="text-[11px] text-white/60 mt-1">
                      Gateway credentials are encrypted on the server. Saved secrets stay hidden; leave a secret field blank to keep its current value. Nagad appears in the UddoktaPay checkout when enabled in that account.
                    </p>
                  </div>
                  <span className="rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-[10px] font-semibold text-white/65">Online checkout providers</span>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#07130c] p-4 space-y-3">
                  <div>
                    <label htmlFor="public-api-base-url" className="text-xs font-bold text-white">Public API Base URL</label>
                    <p className="mt-1 text-[11px] text-white/55">Used to generate payment return and webhook URLs.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="public-api-base-url"
                      type="url"
                      value={publicApiBaseUrl}
                      onChange={(event) => { setPublicApiBaseUrl(event.target.value); setPublicApiBaseUrlStatus(''); }}
                      placeholder="https://api.example.com"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white outline-none focus:border-[#C8FF5E]"
                    />
                    <button
                      type="button"
                      onClick={() => void savePublicApiBaseUrl()}
                      disabled={savingPublicApiBaseUrl || !publicApiBaseUrl.trim()}
                      className="rounded-xl bg-[#C8FF5E] px-4 py-2 text-xs font-bold text-[#07130c] disabled:opacity-50"
                    >
                      {savingPublicApiBaseUrl ? 'Saving…' : 'Save Base URL'}
                    </button>
                  </div>
                  <p className="text-xs text-white/60" role="status">{publicApiBaseUrlStatus}</p>
                </div>

                {gatewayDrafts.length === 0 ? (
                  <p className="text-xs text-white/50">No payment gateways configured yet. Add one above to get started.</p>
                ) : (
                  <div className="space-y-3">
                    {gatewayDrafts.map((gateway) => (
                      <div key={gateway.id} className="rounded-xl border border-white/10 bg-[#07130c] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/40">
                              {gatewayProviderLabels[gateway.provider]}
                            </span>
                            {gateway.isSandbox && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-500/40">
                                Sandbox
                              </span>
                            )}
                            {gateway.isActive && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateGateway(gateway.id, { isSandbox: !gateway.isSandbox })}
                              className="text-[10px] font-semibold px-2.5 py-1 rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
                            >
                              {gateway.isSandbox ? 'Mark as Live' : 'Mark as Sandbox'}
                            </button>
                            <button
                              type="button"
                              onClick={() => updateGateway(gateway.id, { isActive: !gateway.isActive })}
                              className={`text-[10px] font-semibold px-2.5 py-1 rounded-xl border transition-colors cursor-pointer ${
                                gateway.isActive
                                  ? 'border-white/15 text-white/60 hover:text-white hover:bg-white/[0.05]'
                                  : 'border-[#C8FF5E] text-[#C8FF5E] hover:bg-[#C8FF5E]/10'
                              }`}
                            >
                              {gateway.isActive ? 'Disable' : 'Enable'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] text-white/60 font-semibold mb-1 block">Display Label:</label>
                          <input
                            type="text"
                            value={gateway.label}
                            onChange={(e) => updateGateway(gateway.id, { label: e.target.value })}
                            className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2 text-xs text-white focus:border-[#C8FF5E] outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {gateway.provider === 'sslcommerz' && <>
                            <label className="space-y-1">
                              <span className="block text-[11px] font-semibold text-white/60">Store ID</span>
                              <input type="text" value={gateway.storeId || ''} onChange={(event) => updateGateway(gateway.id, { storeId: event.target.value })} placeholder="Sandbox / live Store ID" className="w-full rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white outline-none focus:border-[#C8FF5E]" />
                            </label>
                            <label className="space-y-1">
                              <span className="block text-[11px] font-semibold text-white/60">Store Password</span>
                              <input type="password" value={gateway.apiSecret || ''} onChange={(event) => updateGateway(gateway.id, { apiSecret: event.target.value })} placeholder={gateway.passwordSet ? 'Saved; blank keeps current password' : 'Enter Store Password'} className="w-full rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white outline-none focus:border-[#C8FF5E]" />
                            </label>
                          </>}
                          {gateway.provider === 'surjopay' && <>
                            <label className="space-y-1">
                              <span className="block text-[11px] font-semibold text-white/60">Merchant Prefix</span>
                              <input type="text" value={gateway.prefix || ''} onChange={(event) => updateGateway(gateway.id, { prefix: event.target.value })} placeholder="Provided by ShurjoPay" className="w-full rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white outline-none focus:border-[#C8FF5E]" />
                            </label>
                            <label className="space-y-1">
                              <span className="block text-[11px] font-semibold text-white/60">Store Username</span>
                              <input type="text" value={gateway.username || ''} onChange={(event) => updateGateway(gateway.id, { username: event.target.value })} placeholder="ShurjoPay merchant username" className="w-full rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white outline-none focus:border-[#C8FF5E]" />
                            </label>
                            <label className="space-y-1">
                              <span className="block text-[11px] font-semibold text-white/60">Store Password</span>
                              <input type="password" value={gateway.password || ''} onChange={(event) => updateGateway(gateway.id, { password: event.target.value })} placeholder={gateway.passwordSet ? 'Saved; blank keeps current password' : 'Enter Store Password'} className="w-full rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white outline-none focus:border-[#C8FF5E]" />
                            </label>
                            <label className="space-y-1 sm:col-span-2">
                              <span className="block text-[11px] font-semibold text-white/60">IPN URL · add to the ShurjoPay merchant dashboard</span>
                              <input type="url" value={gateway.ipnUrl || ''} readOnly className="w-full rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white/70 outline-none" />
                            </label>
                          </>}
                          {gateway.provider === 'uddoktapay' && <>
                            {!gateway.isSandbox && <label className="space-y-1">
                              <span className="block text-[11px] font-semibold text-white/60">Production API Origin</span>
                              <input type="url" value={gateway.baseUrl || ''} onChange={(event) => updateGateway(gateway.id, { baseUrl: event.target.value })} placeholder="https://pay.your-domain.com" className="w-full rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white outline-none focus:border-[#C8FF5E]" />
                            </label>}
                            <label className="space-y-1">
                              <span className="block text-[11px] font-semibold text-white/60">UddoktaPay API Key</span>
                              <input type="password" value={gateway.apiKey || ''} onChange={(event) => updateGateway(gateway.id, { apiKey: event.target.value })} placeholder={gateway.apiKeySet ? 'Saved; blank keeps current API key' : 'Enter API key'} className="w-full rounded-xl border border-white/10 bg-[#0A1E14] p-2 text-xs text-white outline-none focus:border-[#C8FF5E]" />
                            </label>
                            <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-[#07130c] p-3 text-[11px] text-white/70 sm:col-span-2">
                              <input type="checkbox" checked={gateway.automatedRefundsEnabled === true} onChange={(event) => updateGateway(gateway.id, { automatedRefundsEnabled: event.target.checked })} className="mt-0.5 accent-[#C8FF5E]" />
                              <span>Enable automated UddoktaPay refunds. The API key must have refund permission; otherwise leave this off for manual refund handling.</span>
                            </label>
                          </>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <p className="text-xs text-white/60" role="status">{gatewaySaveStatus}</p>
                  <button type="button" onClick={() => void savePaymentGateways()} disabled={savingGateways} className="px-4 py-2 rounded-xl bg-[#C8FF5E] text-[#07130c] text-xs font-bold disabled:opacity-50">
                    {savingGateways ? 'Saving…' : 'Save Gateway Settings'}
                  </button>
                </div>
              </div>
            )}

            {settingsSubTab === 'email' && (
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-6 shadow-lg space-y-4 max-w-4xl">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div>
                    <h3 className="text-base font-bold text-white">SMTP / Outgoing Email Servers</h3>
                    <p className="text-[11px] text-white/60 mt-1">
                      Add, edit, or remove SMTP servers used for activation codes, password resets, and booking emails. Only the
                      server marked <strong>Active</strong> is used to send mail.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addSmtpConfig}
                      className="px-3 py-2 rounded-xl border border-white/20 text-white text-xs font-bold hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      + Add SMTP Server
                    </button>
                    <button
                      type="button"
                      disabled={savingSmtpConfigs}
                      onClick={() => void saveSmtpSettings()}
                      className="px-3 py-2 rounded-xl border border-[#C8FF5E]/40 text-[#C8FF5E] text-xs font-bold hover:bg-[#C8FF5E]/10 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {savingSmtpConfigs ? 'Saving…' : 'Save Settings'}
                    </button>
                  </div>
                </div>
                {smtpSaveStatus && <p className="text-xs text-white/70">{smtpSaveStatus}</p>}

                {smtpConfigs.length === 0 ? (
                  <p className="text-xs text-white/50">No SMTP servers configured yet. Add one above to enable activation & reset emails.</p>
                ) : (
                  <div className="space-y-3">
                    {smtpConfigs.map((config) => (
                      <div key={config.id} className="rounded-xl border border-white/10 bg-[#07130c] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[180px]">
                            <input
                              type="text"
                              value={config.label}
                              onChange={(e) => updateSmtpConfig(config.id, { label: e.target.value })}
                              className="bg-[#0A1E14] border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-white focus:border-[#C8FF5E] outline-none"
                            />
                            {config.isActive && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {!config.isActive && (
                              <button
                                type="button"
                                onClick={() => setActiveSmtpConfig(config.id)}
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-xl border border-[#C8FF5E] text-[#C8FF5E] hover:bg-[#C8FF5E]/10 transition-colors cursor-pointer"
                              >
                                Set Active
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeSmtpConfig(config.id)}
                              className="text-[10px] font-semibold px-2.5 py-1 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="sm:col-span-2">
                            <label className="text-white/60 font-semibold mb-1 block">SMTP Server Address:</label>
                            <input
                              type="text"
                              value={config.host}
                              onChange={(e) => updateSmtpConfig(config.id, { host: e.target.value })}
                              placeholder="e.g. postal.trytopdigitize.com"
                              className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                            />
                          </div>
                          <div>
                            <label className="text-white/60 font-semibold mb-1 block">Port:</label>
                            <input
                              type="number"
                              value={config.port}
                              onChange={(e) => updateSmtpConfig(config.id, { port: Number(e.target.value) })}
                              className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2 text-white focus:border-[#C8FF5E] outline-none font-bold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-white/60 font-semibold mb-1 block">Username:</label>
                            <input
                              type="text"
                              value={config.username}
                              onChange={(e) => updateSmtpConfig(config.id, { username: e.target.value })}
                              className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2 text-white focus:border-[#C8FF5E] outline-none font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-white/60 font-semibold mb-1 block">Password:</label>
                            <input
                              type="password"
                              value={config.password}
                              placeholder={config.passwordSet ? 'Saved (leave blank to keep)' : 'Enter SMTP password'}
                              onChange={(e) => updateSmtpConfig(config.id, { password: e.target.value })}
                              className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2 text-white focus:border-[#C8FF5E] outline-none font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-white/60 font-semibold mb-1 block">From Name:</label>
                            <input
                              type="text"
                              value={config.fromName}
                              onChange={(e) => updateSmtpConfig(config.id, { fromName: e.target.value })}
                              className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2 text-white focus:border-[#C8FF5E] outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-white/60 font-semibold mb-1 block">From Email:</label>
                            <input
                              type="email"
                              value={config.fromEmail}
                              onChange={(e) => updateSmtpConfig(config.id, { fromEmail: e.target.value })}
                              placeholder="noreply@yourdomain.com"
                              className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                            />
                          </div>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={config.secure}
                            onChange={(e) => updateSmtpConfig(config.id, { secure: e.target.checked })}
                            className="accent-[#C8FF5E] w-4 h-4"
                          />
                          <span className="text-white/70 font-semibold">Use SSL/TLS (typically port 465)</span>
                        </label>

                        <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row gap-2">
                          <input
                            type="email"
                            value={smtpTestEmailByConfig[config.id] || ''}
                            onChange={(e) => setSmtpTestEmailByConfig((prev) => ({ ...prev, [config.id]: e.target.value }))}
                            placeholder="Send test email to…"
                            className="flex-1 bg-[#0A1E14] border border-white/10 rounded-xl p-2 text-xs text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                          />
                          <button
                            type="button"
                            disabled={sendingTestConfigId === config.id}
                            onClick={() => handleSendSmtpTest(config)}
                            className="px-3 py-2 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors whitespace-nowrap"
                          >
                            {sendingTestConfigId === config.id ? 'Sending…' : 'Send Test Email'}
                          </button>
                        </div>
                        {smtpTestStatusByConfig[config.id] && (
                          <div className="p-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white/70">
                            {smtpTestStatusByConfig[config.id]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {settingsSubTab === 'backups' && (
              <section className="max-w-3xl rounded-2xl border border-white/10 bg-[#0A1E14] p-6 shadow-lg">
                <h2 className="text-lg font-black text-white">Download data backups</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  Download separate JSON exports for player accounts, turf owners, or admins and their related records. Admin exports include account email and status for login reference, but exports omit password hashes, tokens, gateway/email credentials, encrypted payout details, and private verification documents. Keep downloaded files in a secure location.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {([
                    { category: 'players', title: 'Player accounts', description: 'Player profiles and their bookings, reviews, favorites, and notifications.' },
                    { category: 'owners', title: 'Turf owner accounts', description: 'Owner profiles, turfs, bookings, staff assignments, and financial records.' },
                    { category: 'admins', title: 'Admin accounts', description: 'Admin account identity/status and admin-attributed audit history.' },
                  ] as const).map(({ category, title, description }) => (
                    <div key={category} className="rounded-xl border border-white/10 bg-[#07130c] p-4">
                      <h3 className="text-sm font-bold text-white">{title}</h3>
                      <p className="mt-2 min-h-12 text-xs leading-relaxed text-white/55">{description}</p>
                      <button
                        type="button"
                        onClick={() => void downloadAdminBackup(category)}
                        disabled={backupBusyCategory !== null}
                        className="mt-4 w-full rounded-lg bg-[#C8FF5E] px-3 py-2 text-xs font-bold text-[#0A1E14] transition hover:bg-[#A8E63E] disabled:cursor-wait disabled:opacity-50"
                      >
                        {backupBusyCategory === category ? 'Preparing JSON…' : 'Download JSON'}
                      </button>
                    </div>
                  ))}
                </div>
                {backupMessage && <p className="mt-4 text-sm font-semibold text-emerald-300" role="status">{backupMessage}</p>}
                {backupError && <p className="mt-4 text-sm font-semibold text-rose-300" role="alert">{backupError}</p>}
              </section>
            )}

            {settingsSubTab === 'danger' && (
              <section className="max-w-3xl rounded-2xl border border-red-500/40 bg-red-950/20 p-6 shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-red-500/15 p-2 text-red-300"><Trash2 className="h-5 w-5" /></div>
                  <div>
                    <h2 className="text-lg font-black text-red-100">Database kill switch</h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/70">
                      Permanently delete application data from the configured database, including bookings, users other than admins, financial records, and audit logs. Admin accounts, payment gateway settings, gateway fee settings, SMTP settings, and database schema metadata are kept. Other settings are deleted. Uploaded files are not affected.
                    </p>
                  </div>
                </div>
                {killSwitchComplete ? (
                  <p className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-200" role="status">
                    Database data was deleted. Reloading the admin panel…
                  </p>
                ) : (
                  <div className="mt-5 space-y-3">
                    <label htmlFor="kill-switch-confirmation" className="block text-sm font-bold text-white">
                      Type <span className="font-mono text-red-200">WIPE DATABASE</span> to enable the kill switch.
                    </label>
                    <input
                      id="kill-switch-confirmation"
                      type="text"
                      autoComplete="off"
                      value={killSwitchPhrase}
                      onChange={(event) => setKillSwitchPhrase(event.target.value)}
                      disabled={killSwitchBusy}
                      className="w-full max-w-md rounded-xl border border-red-300/30 bg-black/30 p-3 font-mono text-sm text-white outline-none focus:border-red-300 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void runDatabaseKillSwitch()}
                      disabled={killSwitchPhrase !== 'WIPE DATABASE' || killSwitchBusy}
                      className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                      {killSwitchBusy ? 'Wiping database…' : 'Permanently delete application data'}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* TAB 5: REPORTS & ANALYTICS (SECTION 25) */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#C8FF5E]" /> Reports & Analytics Dashboard
                </h2>
                <p className="text-xs text-white/60 mt-1">
                  Booking counts include every status; gross value and revenue include only confirmed, checked-in, completed, or partially refunded bookings.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[10px] text-white/60">From <input type="date" value={reportFrom} max={reportTo} onChange={(event) => setReportFrom(event.target.value)} className="ml-1 rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-1.5 text-white" /></label>
                <label className="text-[10px] text-white/60">To <input type="date" value={reportTo} min={reportFrom} onChange={(event) => setReportTo(event.target.value)} className="ml-1 rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-1.5 text-white" /></label>
                <span className="px-3 py-1.5 rounded-xl border border-white/10 bg-[#0A1E14] text-white/70 text-[10px] font-bold uppercase tracking-wider">Revenue by date range</span>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl bg-[#C8FF5E] text-[#0A1E14] text-[10px] font-bold uppercase tracking-wider shadow-md shadow-[#C8FF5E]/20 cursor-pointer"
                >
                  CSV Export (UI)
                </button>
                <button
                  type="button"
                  onClick={handlePrintRevenueReport}
                  disabled={!revenueReport}
                  className="px-3 py-1.5 rounded-xl border border-white/15 bg-[#0A1E14] text-white text-[10px] font-bold uppercase tracking-wider hover:border-[#C8FF5E] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Print / Save PDF
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Gross Booking Value</div>
                <div className="mt-2 text-xl font-black text-white">৳{reportGrossValue.toLocaleString()}</div>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Platform Revenue</div>
                <div className="mt-2 text-xl font-black text-[#C8FF5E]">৳{reportPlatformRevenue.toLocaleString()}</div>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Net Owner Earnings</div>
                <div className="mt-2 text-xl font-black text-emerald-400">৳{reportNetOwnerEarnings.toLocaleString()}</div>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Bookings</div>
                <div className="mt-2 text-xl font-black text-white">{reportBookingCount}</div>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Cancellation Rate</div>
                <div className="mt-2 text-xl font-black text-amber-300">{reportCancellationRate.toFixed(1)}%</div>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Avg Booking Value</div>
                <div className="mt-2 text-xl font-black text-white">৳{(reportGrossBookingCount ? reportGrossValue / reportGrossBookingCount : 0).toFixed(0)}</div>
              </div>
            </div>

            {revenueReportError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{revenueReportError}</div>}
            {revenueReport && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {(['byOwner', 'byTurf'] as const).map((key) => {
                const rows = (revenueReport[key] || []) as Array<Record<string, unknown>>;
                return <div key={key} className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0A1E14] p-4">
                  <h3 className="mb-3 text-sm font-bold text-white">Revenue by {key === 'byOwner' ? 'owner' : 'turf'}</h3>
                  <table className="w-full text-left text-xs text-white/75"><thead><tr className="border-b border-white/10 text-white/50"><th className="py-2">{key === 'byOwner' ? 'Owner' : 'Turf'}</th><th className="py-2">Bookings</th><th className="py-2">Gross</th><th className="py-2">Platform Revenue</th><th className="py-2">Net Owner Earnings</th></tr></thead>
                    <tbody>{rows.map((row) => <tr key={String(row.user_id || row.turf_id)} className="border-b border-white/5"><td className="py-2 pr-2">{key === 'byOwner' ? String(row.owner_name || 'Owner') : <>{String(row.turf_name || 'Turf')}<span className="block text-[10px] text-white/40">{String(row.owner_name || '')}</span></>}</td><td className="py-2">{Number(row.booking_count || 0)}</td><td className="py-2">৳{Number(row.gross_turf_revenue || 0).toLocaleString()}</td><td className="py-2 text-[#C8FF5E]">৳{Number(row.platform_revenue || 0).toLocaleString()}</td><td className="py-2 text-emerald-300">৳{Number(row.net_owner_earnings || 0).toLocaleString()}</td></tr>)}
                    {!rows.length && <tr><td colSpan={5} className="py-4 text-center text-white/40">No report data for this period.</td></tr>}</tbody></table>
                </div>;
              })}
            </div>}

            <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Revenue Trend</h3>
                    <p className="text-[11px] text-white/60">Last 7 days gross booking value</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/40 text-[10px] font-bold uppercase tracking-wider">
                    Daily</span>
                </div>

                <div className="mt-6 flex items-end justify-between gap-3 h-44">
                  {reportDays.map((day) => {
                    const height = Math.max(14, (day.value / maxReportDailyRevenue) * 100);

                    return (
                      <div key={day.key} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full h-32 flex items-end justify-center rounded-xl border border-white/10 bg-[#07130c] p-1.5">
                          <div
                            className="w-full rounded-lg bg-gradient-to-t from-[#C8FF5E] via-emerald-400 to-emerald-300"
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-white/60">{day.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-white">Booking Source Mix</h3>
                  <span className="text-[10px] uppercase tracking-wider text-white/50">Revenue</span>
                </div>

                <div className="mt-5 space-y-4">
                  {reportSources.map(({ source, total }) => {
                    const width = (total / Math.max(reportSources[0]?.total || 1, 1)) * 100;

                    return (
                      <div key={source}>
                        <div className="flex items-center justify-between text-[11px] text-white/70">
                          <span className="font-semibold capitalize">{source.replace('_', ' ')}</span>
                          <span className="font-bold text-[#C8FF5E]">৳{total.toLocaleString()}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#C8FF5E] to-emerald-400"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <h3 className="text-sm font-bold text-white">Top Turf Revenue</h3>
                  <span className="text-[10px] uppercase tracking-wider text-white/50">Net owner earnings</span>
                </div>

                <div className="mt-4 space-y-4">
                  {reportTurfs.map((turf) => {
                    const width = (turf.total / maxReportTurfEarnings) * 100;

                    return (
                      <div key={turf.name}>
                        <div className="flex items-center justify-between gap-3 text-[11px]">
                          <div>
                            <div className="font-bold text-white">{turf.name}</div>
                            <div className="text-white/60">{turf.bookings} bookings</div>
                          </div>
                          <div className="font-black text-[#C8FF5E]">৳{turf.total.toLocaleString()}</div>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-[#C8FF5E]"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <h3 className="text-sm font-bold text-white">Operational Snapshot</h3>
                  <span className="text-[10px] uppercase tracking-wider text-white/50">Live metrics</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-[#07130c] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/50">Completed</div>
                    <div className="mt-2 text-lg font-black text-white">{completedBookings}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#07130c] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/50">Cancelled</div>
                    <div className="mt-2 text-lg font-black text-amber-300">{cancelledBookings}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#07130c] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/50">Pending Approvals</div>
                    <div className="mt-2 text-lg font-black text-white">{pendingTurfs.length + pendingOwners.length}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#07130c] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-white/50">Open Disputes</div>
                    <div className="mt-2 text-lg font-black text-rose-300">{disputes.filter((d) => d.status === 'pending').length}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#0A1E14] border border-white/10 rounded-2xl overflow-hidden shadow-lg">
              <div className="flex items-center justify-between gap-3 p-4 border-b border-white/10">
                <div>
                  <h3 className="text-sm font-bold text-white">Recent Booking Snapshot</h3>
                  <p className="text-[11px] text-white/60">Latest bookings across the platform</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('bookings')}
                  className="px-3 py-1.5 rounded-xl bg-[#C8FF5E] text-[#0A1E14] text-[10px] font-bold uppercase tracking-wider shadow-md shadow-[#C8FF5E]/20 cursor-pointer"
                >
                  View All
                </button>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="bg-[#0e271a] text-white/60 uppercase font-bold text-[10px] border-b border-white/10">
                    <tr>
                      <th className="py-3 px-4">Booking #</th>
                      <th className="py-3 px-4">Turf</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4">Paid Total</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {recentBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">{b.bookingNumber}</td>
                        <td className="py-3 px-4 text-white">{b.turfName}</td>
                        <td className="py-3 px-4 text-white/60">{b.date}</td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/30">
                            {b.bookingSource}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-black text-white">৳{b.totalPaid.toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                              b.status === 'confirmed' || b.status === 'checked_in'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                : b.status === 'completed'
                                ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                                : 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                            }`}
                          >
                            {b.status.replace('_', ' ')}
                          </span>
                          {b.cancellationRequestStatus && <div className="mt-2 max-w-56 space-y-1 text-[10px] text-amber-100">
                            <p className="font-bold">Player cancellation: {b.cancellationRequestStatus}</p>
                            <p>Saved policy refund: {b.cancellationRequestRefundPercentage ?? 0}%</p>
                            {b.cancellationDecisionReason && <p>Owner response: {b.cancellationDecisionReason}</p>}
                          </div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ALL PLATFORM BOOKINGS */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white">Platform-Wide Booking Oversight</h2>
                <p className="text-xs text-white/60">All reservations across vendors, sources, and payment states.</p>
              </div>
            </div>

            <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bookingSearchQuery}
                  onChange={(event) => {
                    setBookingSearchQuery(event.target.value);
                    setBookingPage(1);
                  }}
                  placeholder="Search by booking number, customer, turf, source, or status..."
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                />
              </div>

              <div className="flex items-center gap-2 text-[11px] text-white/60">
                <span className="px-2.5 py-1.5 rounded-xl bg-[#07130c] border border-white/10">
                  {filteredBookingsForAdmin.length} results
                </span>
              </div>
            </div>

            <div className="bg-[#0A1E14] border border-white/10 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="bg-[#0e271a] text-white/60 uppercase font-bold text-[10px] border-b border-white/10">
                    <tr>
                      <th className="py-3 px-4">Booking #</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Turf & Date</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4">Paid Total</th>
                      <th className="py-3 px-4">Platform Fee</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Intervention</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {paginatedBookingsForAdmin.map((b) => (
                      <tr key={b.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">{b.bookingNumber}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{b.customerName}</div>
                          <div className="text-[11px] text-white/60">{b.customerPhone}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-white font-medium">{b.turfName}</div>
                          <div className="text-[11px] text-white/60">
                            {b.date} ({formatBDTimeRange(b.startTime, b.endTime)})
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/30">
                            {b.bookingSource}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-black text-white">৳{b.totalPaid}</td>
                        <td className="py-3 px-4 text-[#C8FF5E] font-bold">৳{b.platformFeeAmount}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                              b.status === 'confirmed'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                : b.status === 'completed'
                                ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                                : 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                            }`}
                          >
                            {b.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {b.paymentStatus === 'paid' && b.cancellationRequestStatus !== 'pending' && b.status === 'confirmed' && (
                            <button
                              onClick={() => void handleAdminBookingStatus(b.id, 'checked_in')}
                              disabled={bookingStatusSavingId === b.id}
                              className="mr-2 px-2.5 py-1 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 text-[11px] font-semibold rounded-xl border border-emerald-800/40 cursor-pointer transition-colors disabled:opacity-50"
                            >
                              {bookingStatusSavingId === b.id ? 'Saving...' : 'Check in'}
                            </button>
                          )}
                          {b.paymentStatus === 'paid' && b.cancellationRequestStatus !== 'pending' && ['confirmed', 'checked_in'].includes(b.status) && (
                            <button
                              onClick={() => void handleAdminBookingStatus(b.id, 'completed')}
                              disabled={bookingStatusSavingId === b.id}
                              className="mr-2 px-2.5 py-1 bg-[#0e271a] text-[#C8FF5E] hover:bg-[#143522] text-[11px] font-semibold rounded-xl border border-[#C8FF5E]/30 cursor-pointer transition-colors disabled:opacity-50"
                            >
                              {bookingStatusSavingId === b.id ? 'Saving...' : 'Mark complete'}
                            </button>
                          )}
                          {b.status !== 'cancelled' && b.status !== 'refunded' && (
                            <button
                              onClick={async () => {
                                if (confirm('Admin force cancellation will issue full refund to player. Proceed?')) {
                                  const result = await cancelBooking(b.id, 'Admin force cancelled dispute', true);
                                  if (!result.success) showAppAlert(result.message);
                                }
                              }}
                              className="px-2.5 py-1 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 text-[11px] font-semibold rounded-xl border border-rose-800/40 cursor-pointer transition-colors"
                            >
                              Force Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {paginatedBookingsForAdmin.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-white/50">
                    No bookings match the current search.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#0e271a] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setBookingPage((page) => Math.max(1, page - 1))}
                  disabled={bookingPage === 1}
                  className="rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <div className="text-[11px] text-white/60">
                  Page {bookingPage} of {bookingPageCount}
                </div>

                <button
                  type="button"
                  onClick={() => setBookingPage((page) => Math.min(bookingPageCount, page + 1))}
                  disabled={bookingPage >= bookingPageCount}
                  className="rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: DISPUTES RESOLUTION */}
        {activeTab === 'disputes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white">Dispute Center & Arbitration</h2>
                <p className="text-xs text-white/60">Investigate and arbitrate complaints between players and turf owners.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A1E14] p-5 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white">Refund queue</h3>
                <p className="mt-1 text-xs text-white/60">Online refunds use the original payment provider where supported. SSLCommerz can be checked here; UddoktaPay submissions remain processing until you verify completion in its dashboard and record the refund reference. Refunds do not go through a Turfyslot wallet.</p>
              </div>
              {pendingRefunds.length === 0 ? <p className="text-xs text-white/50">No refunds need processing.</p> : pendingRefunds.map((refund) => (
                <div key={refund.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#07130c] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-white/80">
                    <p className="font-semibold text-white">#{refund.bookingNumber} · {refund.turfName}</p>
                    <p className="mt-1">{refund.playerName || 'Player'} · ৳{refund.amount.toLocaleString()} · {refund.bookingSource.replace('_', ' ')}</p>
                    <p className="mt-1 text-amber-200">{refund.gatewayError || (refund.status === 'processing'
                      ? 'Gateway refund is processing.'
                      : refund.gatewaySupported
                        ? `Ready for ${refund.paymentGateway || 'payment gateway'}.`
                        : refund.paymentGateway === 'surjopay'
                          ? 'Process this refund in the ShurjoPay merchant panel or with an approved signed credit slip, then record its reference here.'
                          : 'Manual processing required.')}</p>
                  </div>
                  <div className="flex gap-2">
                    {refund.gatewaySupported && refund.paymentGateway === 'sslcommerz' && <button onClick={async () => { const result = await processRefundWithGateway(refund.id, 'sslcommerz'); if (!result.success) showAppAlert(result.message); }} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-[#07130c]">{refund.status === 'processing' ? 'Check SSLCommerz status' : 'Refund via SSLCommerz'}</button>}
                    {refund.gatewaySupported && refund.paymentGateway === 'uddoktapay' && refund.status === 'pending' && <button onClick={async () => { const result = await processRefundWithGateway(refund.id, 'uddoktapay'); if (!result.success) showAppAlert(result.message); else showAppAlert(result.message); }} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-[#07130c]">Submit UddoktaPay refund</button>}
                    {refund.paymentGateway === 'uddoktapay' && refund.status === 'processing' && refund.gatewayRequestId && <button onClick={async () => { const reference = (await showAppPrompt('After confirming completion in UddoktaPay, enter its refund reference:'))?.trim(); if (!reference) return; const result = await markRefundProcessed(refund.id, reference); if (!result.success) showAppAlert(result.message); }} className="rounded-lg border border-emerald-300/40 px-3 py-2 text-xs font-semibold text-emerald-100">Confirm completed refund</button>}
                    {!refund.gatewaySupported && <button onClick={async () => {
                      const prompt = refund.paymentGateway === 'surjopay'
                        ? 'After processing this refund through the ShurjoPay merchant panel or approved credit-slip workflow, enter the ShurjoPay refund reference:'
                        : 'Enter the bank or mobile wallet refund reference:';
                      const reference = (await showAppPrompt(prompt))?.trim();
                      if (!reference) return;
                      const result = await markRefundProcessed(refund.id, reference);
                      if (!result.success) showAppAlert(result.message);
                    }} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white">{refund.paymentGateway === 'surjopay' ? 'Record ShurjoPay refund' : 'Record manual refund'}</button>}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {disputes.map((d) => (
                <div key={d.id} className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-xs text-[#C8FF5E]">Ref #{d.bookingNumber}</span>
                      <h4 className="font-bold text-white text-sm mt-0.5">Raised by: {d.raisedByName}</h4>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                        d.status === 'resolved'
                          ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                          : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>

                  <div className="bg-[#07130c] border border-white/10 p-3 rounded-xl text-xs space-y-1">
                    <div className="text-white/60 uppercase text-[10px] font-bold">Category: {d.category}</div>
                    <p className="text-white/80">{d.description}</p>
                  </div>

                  {d.status === 'resolved' ? (
                    <div className="text-xs text-[#C8FF5E] font-medium">
                      Resolution: {d.resolutionNotes} (By: {d.resolvedBy})
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => resolveDispute(d.id, 'Admin audited communication and verified issue resolved')}
                        className="w-full py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                      >
                        Mark Dispute Resolved
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 8: TOURNAMENTS (SECTION 50)                                           */}
        {/* ========================================================================= */}
        {activeTab === 'tournaments' && (
          <div className="mt-6">
            <TournamentsView />
          </div>
        )}

        {activeTab === 'legal_pages' && (
          <section className="mt-6 space-y-5">
            <header className="rounded-2xl border border-white/10 bg-[#0A1E14] p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-base font-bold text-white">
                <FileText className="h-5 w-5 text-[#C8FF5E]" /> Public Legal Pages
              </h2>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-white/60">
                Edit the public Privacy Policy, Terms of Service, and Refund Policy. Drafts stay private until you explicitly publish them. Content is rendered as plain text; HTML is not executed.
              </p>
            </header>

            {legalPagesLoading && <p role="status" className="text-sm text-white/60">Loading legal page drafts…</p>}
            {legalPagesError && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-950/30 p-3 text-sm text-rose-200">{legalPagesError}</p>}
            {legalPages && !legalPagesLoading && (
              <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <nav aria-label="Select legal page" className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#0A1E14] p-2 lg:flex-col lg:overflow-visible">
                  {LEGAL_PAGE_SLUGS.map((slug) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => { setLegalPageSelection(slug); setLegalPagesMessage(''); }}
                      className={`min-h-11 shrink-0 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${
                        legalPageSelection === slug ? 'bg-[#C8FF5E] text-[#0A1E14]' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      {legalPages[slug].title}
                    </button>
                  ))}
                </nav>

                <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0A1E14] p-4 sm:p-6">
                  {legalPageSelection !== 'refund-policy' && legalPages[legalPageSelection].content.startsWith('STARTER DRAFT') && (
                    <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                      This starter text is not approved legal copy. Replace it with content reviewed for your business before publishing.
                    </p>
                  )}
                  <label className="block text-xs font-semibold text-white/70" htmlFor="legal-page-content">
                    {legalPages[legalPageSelection].title} content
                    <textarea
                      id="legal-page-content"
                      value={legalPages[legalPageSelection].content}
                      maxLength={30000}
                      rows={18}
                      onChange={(event) => {
                        const content = event.target.value;
                        setLegalPages((previous) => previous ? ({
                          ...previous,
                          [legalPageSelection]: { ...previous[legalPageSelection], content },
                        }) : previous);
                        setLegalPagesMessage('');
                      }}
                      className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-[#07130c] p-4 text-sm leading-6 text-white outline-none focus:border-[#C8FF5E]/60"
                      placeholder="Write page content using plain text. Separate paragraphs with a blank line; lines beginning with ## appear as section headings."
                    />
                    <span className="mt-1 block text-right text-[10px] text-white/40">{legalPages[legalPageSelection].content.length.toLocaleString()} / 30,000</span>
                  </label>

                  {legalPageSelection === 'refund-policy' && (
                    <div className="space-y-3 rounded-xl border border-white/10 bg-[#07130c] p-4">
                      <div>
                        <h3 className="text-sm font-bold text-white">Public refund matrix preview</h3>
                        <p className="mt-1 text-[11px] leading-5 text-white/50">Read-only and generated from the global default policy. Manage the rates in the Policy Engine. Tier boundaries are elapsed hours since booking creation.</p>
                      </div>
                      {(() => {
                        const defaultPolicy = cancellationPolicies.find((policy) => policy.isDefault);
                        return defaultPolicy?.tiers.length ? (
                          <div className="overflow-x-auto rounded-lg border border-white/10">
                            <table className="w-full min-w-[360px] text-left text-xs">
                              <thead className="bg-white/[0.05] text-[10px] uppercase text-white/45">
                                <tr><th className="px-3 py-2">Hours since booking</th><th className="px-3 py-2">Refund</th></tr>
                              </thead>
                              <tbody className="divide-y divide-white/10">
                                {[...defaultPolicy.tiers].sort((a, b) => a.minHoursBefore - b.minHoursBefore).map((tier) => (
                                  <tr key={tier.id}>
                                    <td className="px-3 py-2 text-white/80">{tier.maxHoursBefore == null ? `${tier.minHoursBefore}+ hours` : `${tier.minHoursBefore}–<${tier.maxHoursBefore} hours`}</td>
                                    <td className="px-3 py-2 font-bold text-[#C8FF5E]">{tier.refundPercentage}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="text-xs text-amber-200">Global default cancellation policy could not be loaded.</p>;
                      })()}
                    </div>
                  )}

                  <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={legalPages[legalPageSelection].published}
                      onChange={(event) => {
                        const published = event.target.checked;
                        setLegalPages((previous) => previous ? ({
                          ...previous,
                          [legalPageSelection]: { ...previous[legalPageSelection], published },
                        }) : previous);
                        setLegalPagesMessage('');
                      }}
                      className="h-4 w-4 accent-[#C8FF5E]"
                    />
                    Publish this page publicly
                  </label>

                  {legalPagesMessage && <p role="status" className="text-xs font-semibold text-[#C8FF5E]">{legalPagesMessage}</p>}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <a href={`/${legalPageSelection}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-xs font-bold text-white/75 hover:border-[#C8FF5E]/40 hover:text-[#C8FF5E]">
                      Preview public page
                    </a>
                    <button
                      type="button"
                      disabled={legalPagesSaving}
                      onClick={() => void saveLegalPages()}
                      className="min-h-11 rounded-xl bg-[#C8FF5E] px-5 py-2 text-xs font-black text-[#0A1E14] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {legalPagesSaving ? 'Saving…' : legalPages[legalPageSelection].published ? 'Save & Publish' : 'Save Draft'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* MODAL: APPROVE WITHDRAWAL */}
      {selectedWdForApproval && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A1E14] border border-white/15 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Approve & Disburse Payout</h3>
            <p className="text-xs text-white/70">
              Enter the bank/bKash disbursement transaction reference for audit tracking:
            </p>

            <input
              type="text"
              value={payoutRef}
              onChange={(e) => setPayoutRef(e.target.value)}
              placeholder="e.g. BKASH-TXN-882910 or BRAC-FT-99120"
              className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-xs text-white focus:border-[#C8FF5E] outline-none"
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedWdForApproval(null)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  approveWithdrawal(selectedWdForApproval, payoutRef || 'ADMIN-DISBURSED');
                  setSelectedWdForApproval(null);
                  setPayoutRef('');
                }}
                className="flex-1 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
              >
                Confirm Payout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REJECT WITHDRAWAL */}
      {selectedWdForReject && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A1E14] border border-white/15 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Reject Withdrawal Request</h3>
            <p className="text-xs text-white/70">
              Funds will be automatically returned to the owner's available wallet balance. State reason:
            </p>

            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Bank account name mismatch / KYC verification required"
              className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-xs text-white focus:border-[#C8FF5E] outline-none"
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedWdForReject(null)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  rejectWithdrawal(selectedWdForReject, rejectReason || 'Account mismatch');
                  setSelectedWdForReject(null);
                  setRejectReason('');
                }}
                className="flex-1 py-2.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-800/60 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
      {correctionOwner && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Request verification update">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1710] p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-white">Request verification update</h2>
            <p className="mt-1 text-sm text-white/60">Explain what the owner needs to correct. They will receive an in-app and email notification.</p>
            <textarea value={correctionMessage} onChange={(event) => setCorrectionMessage(event.target.value)} maxLength={2000} rows={5} placeholder="For example: Please upload a clear, current trade license that shows the business name." className="mt-4 w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white outline-none focus:border-[#C8FF5E]" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCorrectionOwner(null)} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white">Cancel</button>
              <button type="button" disabled={correctionSaving || !correctionMessage.trim()} onClick={async () => { setCorrectionSaving(true); const result = await requestOwnerCorrections(correctionOwner, correctionMessage.trim()); setCorrectionSaving(false); if (result.success) setCorrectionOwner(null); else showAppAlert(result.message); }} className="rounded-lg bg-[#C8FF5E] px-4 py-2 text-sm font-bold text-[#102014] disabled:opacity-50">{correctionSaving ? 'Sending…' : 'Send Request'}</button>
            </div>
          </div>
        </div>
      )}
      {previewDocument && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={`Preview ${previewDocument.fileName}`} onClick={closeOwnerDocumentPreview}>
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b1710] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div className="flex min-w-0 items-center gap-2 text-white"><FileText size={18} className="shrink-0 text-[#C8FF5E]" /><span className="truncate font-semibold">{previewDocument.fileName}</span></div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={previewDocument.dataUrl} download={previewDocument.fileName} className="inline-flex items-center gap-2 rounded-lg bg-[#C8FF5E] px-3 py-2 text-sm font-bold text-[#102014]"><Download size={16} /> Download</a>
                <button type="button" onClick={closeOwnerDocumentPreview} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close preview"><X size={18} /></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#18231c] p-3">
              {previewDocument.mimeType.toLowerCase().includes('pdf') || previewDocument.fileName.toLowerCase().endsWith('.pdf') ? (
                <iframe title={`PDF preview: ${previewDocument.fileName}`} src={previewDocument.dataUrl} className="h-[75vh] w-full rounded-lg bg-white" />
              ) : previewDocument.mimeType.toLowerCase().startsWith('image/') ? (
                <img src={previewDocument.dataUrl} alt={previewDocument.fileName} className="mx-auto max-h-[75vh] max-w-full object-contain" />
              ) : (
                <div className="flex h-48 flex-col items-center justify-center gap-3 text-center text-white/70"><FileText size={32} /><p>Preview is not available for this file type. You can download it to view it.</p></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

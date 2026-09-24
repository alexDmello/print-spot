'use client';

import React, { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { MobileBottomCta } from './MobileBottomCta';
import {
  Clock,
  Printer,
  Bell,
  MapPin,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface LiveQueueTrackerProps {
  jobId: string;
  initialTokenCode: string;
  initialPosition: number;
  initialEstimatedWait: number;
  pickupCode: string;
  onReadyForPickup: () => void;
}

export const LiveQueueTracker: React.FC<LiveQueueTrackerProps> = ({
  jobId,
  initialTokenCode,
  initialPosition,
  initialEstimatedWait,
  pickupCode,
  onReadyForPickup,
}) => {
  const [tokenCode, setTokenCode] = useState(initialTokenCode);
  const [position, setPosition] = useState(initialPosition);
  const [nowServing, setNowServing] = useState<string | null>('#39');
  const [status, setStatus] = useState<'waiting' | 'printing' | 'ready' | 'failed' | 'picked_up'>('waiting');
  const [estimatedWait, setEstimatedWait] = useState(initialEstimatedWait || 5);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [isRerouted, setIsRerouted] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    socket.emit('subscribe_job', { jobId });

    const handleStatusUpdate = (data: any) => {
      if (data.jobId === jobId) {
        if (data.tokenCode) setTokenCode(data.tokenCode);
        if (data.status) setStatus(data.status);
        if (typeof data.position === 'number') setPosition(data.position);
        if (data.nowServingToken) setNowServing(data.nowServingToken);
        if (typeof data.estimatedWaitMinutes === 'number') setEstimatedWait(data.estimatedWaitMinutes);
        if (data.errorMessage) setErrorMessage(data.errorMessage);

        if (data.status === 'ready') {
          onReadyForPickup();
        }
      }
    };

    const handlePosChanged = (data: any) => {
      if (data.jobId === jobId) {
        setPosition(data.newPosition);
        if (data.nowServingToken) setNowServing(data.nowServingToken);
      }
    };

    socket.on('job_status_update', handleStatusUpdate);
    socket.on('queue_position_changed', handlePosChanged);

    return () => {
      socket.off('job_status_update', handleStatusUpdate);
      socket.off('queue_position_changed', handlePosChanged);
    };
  }, [jobId, onReadyForPickup]);

  const jobsRemaining = Math.max(0, position - 1);

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-24">
      {/* Title */}
      <div className="space-y-0.5 pt-1">
        <span className="text-xs font-bold text-[#0e7490] uppercase tracking-wider">
          Active Queue
        </span>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Live Printer Status
        </h1>
      </div>

      {/* 1. Main Billboard Card: Now Serving vs Your Turn */}
      <div className="figma-card p-5 space-y-4">
        <div className="grid grid-cols-2 divide-x divide-slate-100 text-center">
          <div className="space-y-0.5 pr-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Now Serving
            </span>
            <div className="text-3xl font-black text-amber-500">
              {nowServing || '#39'}
            </div>
          </div>

          <div className="space-y-0.5 pl-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#0e7490]">
              Your Turn
            </span>
            <div className="text-3xl font-black text-[#0e7490]">
              {tokenCode}
            </div>
          </div>
        </div>

        {/* Printing Progress Status Bar */}
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Printing Progress</span>
            <span className="font-bold text-[#0e7490]">
              {status === 'printing'
                ? 'Spooling in Tray Now!'
                : `${jobsRemaining} ${jobsRemaining === 1 ? 'job' : 'jobs'} remaining`}
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                status === 'printing' ? 'bg-[#0e7490] animate-pulse w-4/5' : 'bg-[#0e7490] w-1/3'
              }`}
            />
          </div>
        </div>
      </div>

      {/* 2. Error / Mechanical Delay Alert State (Figma Screen 14) */}
      {status === 'failed' && (
        <div className="figma-card p-4 bg-amber-50/70 border-amber-200 space-y-3 text-left">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Mechanical Printer Delay</span>
          </div>

          <p className="text-[11px] text-amber-900 leading-relaxed">
            Our support technicians are resolving a paper feed issue at Station Hub 3.
            {errorMessage && <span className="block mt-1 font-mono text-[10px] text-red-600">{errorMessage}</span>}
          </p>

          <div className="p-3 rounded-xl bg-white border border-amber-200 space-y-1">
            <h4 className="font-bold text-slate-900 text-xs">Need immediate prints?</h4>
            <p className="text-[11px] text-slate-500">
              You can instantly reroute this order to Station Hub 1 to bypass this delay.
            </p>
            <button
              type="button"
              onClick={() => setIsRerouted(true)}
              className="mt-1.5 w-full py-2 rounded-lg bg-[#0e7490] text-white text-xs font-semibold"
            >
              {isRerouted ? '✓ Rerouted to Station Hub 1' : 'Reroute to Station Hub 1'}
            </button>
          </div>
        </div>
      )}

      {/* 3. SMS Notification Card */}
      <div className="figma-card p-3.5 flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <Bell className="w-3.5 h-3.5 text-[#0e7490]" />
            <span>Notify when complete</span>
          </div>
          <p className="text-[11px] text-slate-500">Get an instant SMS when your sheets are bound.</p>
        </div>

        <button
          type="button"
          onClick={() => setSmsEnabled(!smsEnabled)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            smsEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-[#ecfeff] text-[#0e7490]'
          }`}
        >
          {smsEnabled ? 'Enabled' : 'Enable'}
        </button>
      </div>

      {/* 4. Assigned Location Card */}
      <div className="figma-card p-4 space-y-1.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Assigned Pickup Location
        </span>
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-[#0e7490] shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-slate-900 text-xs">
              {isRerouted ? 'Main Corridor - Station Hub 1' : 'Central Library - Station Hub 3'}
            </h3>
            <p className="text-[11px] text-slate-500">
              Ground Floor, opposite the reference desk resource center.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky Bottom CTA */}
      <MobileBottomCta
        label={status === 'ready' ? 'Status' : 'Remaining Wait'}
        value={status === 'ready' ? 'Ready in Tray!' : `~ ${estimatedWait} mins`}
        buttonText={status === 'ready' ? 'Release Now' : 'Directions'}
        onButtonClick={onReadyForPickup}
      />
    </div>
  );
};

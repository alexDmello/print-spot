'use client';

import React from 'react';
import CustomerAppView from '@/components/CustomerAppView';

interface CounterPageProps {
  params: {
    slug: string;
  };
}

/**
 * Dedicated Customer Counter Order Gateway
 * 
 * Direct entrypoint for customers scanning counter QR standees or visiting /counter/:slug.
 * Completely isolates the customer print ordering experience from any shopkeeper authentication
 * or administrative redirects.
 */
export default function CounterOrderPage({ params }: CounterPageProps) {
  return <CustomerAppView forcedShopSlugOrId={params.slug} />;
}

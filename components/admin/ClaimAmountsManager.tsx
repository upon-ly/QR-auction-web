"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';

interface ClaimAmountConfig {
  id: string;
  category: string;
  amount: number;
  description: string;
  min_score?: number;
  max_score?: number;
  is_active: boolean;
}

interface UpdateResult {
  id: string;
  success: boolean;
  error?: string;
}

export function ClaimAmountsManager() {
  const { address } = useAccount();
  const [claimAmounts, setClaimAmounts] = useState<ClaimAmountConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editedValues, setEditedValues] = useState<{[key: string]: Partial<ClaimAmountConfig>}>({});

  const fetchClaimAmounts = useCallback(async () => {
    if (!address) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/claim-amounts', {
        headers: {
          'Authorization': `Bearer ${address}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch claim amounts');
      }

      const data = await response.json();
      setClaimAmounts(data.data || []);
    } catch (error) {
      console.error('Error fetching claim amounts:', error);
      toast.error('Failed to fetch claim amounts');
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Fetch claim amounts on mount
  useEffect(() => {
    fetchClaimAmounts();
  }, [fetchClaimAmounts]);

  const handleValueChange = (id: string, field: keyof ClaimAmountConfig, value: string | number) => {
    setEditedValues(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: field === 'amount' ? (parseInt(value as string) || 0) : 
                 field === 'min_score' || field === 'max_score' ? parseFloat(value as string) || 0 :
                 value
      }
    }));
  };

  const saveChanges = async () => {
    if (!address) return;
    
    try {
      setIsSaving(true);
      
      // Prepare updates array
      const updates = Object.entries(editedValues).map(([id, changes]) => ({
        id,
        ...changes
      }));

      const response = await fetch('/api/admin/claim-amounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${address}`
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to save changes');
      }

      const result = await response.json();
      
      // Check if all updates were successful
      const failures = result.results?.filter((r: UpdateResult) => !r.success) || [];
      if (failures.length > 0) {
        toast.error(`Some updates failed: ${failures.map((f: UpdateResult) => f.error).join(', ')}`);
      } else {
        toast.success('Claim amounts updated successfully');
        setEditedValues({});
        await fetchClaimAmounts(); // Refresh data
      }
    } catch (error) {
      console.error('Error saving changes:', error);
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (id: string, currentState: boolean) => {
    if (!address) return;
    
    try {
      const response = await fetch('/api/admin/claim-amounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${address}`
        },
        body: JSON.stringify([{ id, is_active: !currentState }])
      });

      if (!response.ok) {
        throw new Error('Failed to toggle status');
      }

      toast.success(`Configuration ${!currentState ? 'activated' : 'deactivated'}`);
      await fetchClaimAmounts();
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Failed to update status');
    }
  };

  // Group configs by type and apply custom sorting
  const neynarConfigs = claimAmounts
    .filter((c: ClaimAmountConfig) => c.category.startsWith('neynar_'))
    .sort((a: ClaimAmountConfig, b: ClaimAmountConfig) => {
      // Sort by min_score descending (highest score groups first)
      const aScore = a.min_score ?? 0;
      const bScore = b.min_score ?? 0;
      return bScore - aScore;
    });
    
  const walletConfigs = claimAmounts
    .filter((c: ClaimAmountConfig) => c.category.startsWith('wallet_'))
    .sort((a: ClaimAmountConfig, b: ClaimAmountConfig) => {
      // Sort by amount descending (highest amounts first)
      return b.amount - a.amount;
    });
    
  const defaultConfig = claimAmounts.find((c: ClaimAmountConfig) => c.category === 'default');

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg">
        <p className="text-gray-600 dark:text-gray-400">Loading claim amounts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300 mb-2">
          Claim Amount Configuration
        </h3>
        <p className="text-blue-700 dark:text-blue-400">
          Configure the QR token amounts users receive when claiming rewards. Changes are applied immediately.
        </p>
      </div>

      {/* Neynar Score-based Amounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Neynar Score-based Amounts (Mini-app)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {neynarConfigs.map(config => {
              const hasChanges = editedValues[config.id] !== undefined;
              const displayAmount = editedValues[config.id]?.amount ?? config.amount;
              const displayMinScore = editedValues[config.id]?.min_score ?? config.min_score;
              const displayMaxScore = editedValues[config.id]?.max_score ?? config.max_score;
              const displayDescription = editedValues[config.id]?.description ?? config.description;
              
              return (
                <div key={config.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={displayDescription}
                        onChange={(e) => handleValueChange(config.id, 'description', e.target.value)}
                        className={`w-full p-2 border rounded-md ${
                          hasChanges ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                        } bg-white dark:bg-gray-800 font-medium`}
                        placeholder="Description"
                      />
                      <div className="flex items-center space-x-2 text-sm">
                        <span className="text-gray-500">Score range:</span>
                        <input
                          type="number"
                          value={displayMinScore}
                          onChange={(e) => handleValueChange(config.id, 'min_score', e.target.value)}
                          className={`w-16 p-1 border rounded ${
                            hasChanges ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                          } bg-white dark:bg-gray-800`}
                          min="0"
                          max="1"
                          step="0.1"
                        />
                        <span className="text-gray-500">to</span>
                        <input
                          type="number"
                          value={displayMaxScore}
                          onChange={(e) => handleValueChange(config.id, 'max_score', e.target.value)}
                          className={`w-16 p-1 border rounded ${
                            hasChanges ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                          } bg-white dark:bg-gray-800`}
                          min="0"
                          max="1"
                          step="0.1"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 ml-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          value={displayAmount}
                          onChange={(e) => handleValueChange(config.id, 'amount', e.target.value)}
                          className={`w-24 p-2 border rounded-md ${
                            hasChanges ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                          } bg-white dark:bg-gray-800`}
                          min="0"
                          step="100"
                        />
                        <span className="text-sm text-gray-500">QR</span>
                      </div>
                      <button
                        onClick={() => toggleActive(config.id, config.is_active)}
                        className={`px-3 py-1 rounded text-sm ${
                          config.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {config.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Wallet-based Amounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Wallet-based Amounts (Web)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {walletConfigs.map(config => {
              const hasChanges = editedValues[config.id] !== undefined;
              const displayAmount = editedValues[config.id]?.amount ?? config.amount;
              const displayDescription = editedValues[config.id]?.description ?? config.description;
              
              return (
                <div key={config.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={displayDescription}
                        onChange={(e) => handleValueChange(config.id, 'description', e.target.value)}
                        className={`w-full p-2 border rounded-md ${
                          hasChanges ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                        } bg-white dark:bg-gray-800 font-medium`}
                        placeholder="Description"
                      />
                      <p className="text-sm text-gray-500">
                        {config.category === 'wallet_empty' ? 'Empty wallets' : 'Wallets with ETH/tokens'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-4 ml-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          value={displayAmount}
                          onChange={(e) => handleValueChange(config.id, 'amount', e.target.value)}
                          className={`w-24 p-2 border rounded-md ${
                            hasChanges ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                          } bg-white dark:bg-gray-800`}
                          min="0"
                          step="100"
                        />
                        <span className="text-sm text-gray-500">QR</span>
                      </div>
                      <button
                        onClick={() => toggleActive(config.id, config.is_active)}
                        className={`px-3 py-1 rounded text-sm ${
                          config.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {config.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Default Amount */}
      {defaultConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Default Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">{defaultConfig.description}</h4>
                <p className="text-sm text-gray-500">
                  Used when no other configuration matches
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={editedValues[defaultConfig.id]?.amount ?? defaultConfig.amount}
                    onChange={(e) => handleValueChange(defaultConfig.id, 'amount', e.target.value)}
                    className={`w-24 p-2 border rounded-md ${
                      editedValues[defaultConfig.id] !== undefined ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-gray-800`}
                    min="0"
                    step="100"
                  />
                  <span className="text-sm text-gray-500">QR</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      {Object.keys(editedValues).length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={saveChanges}
            disabled={isSaving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isSaving && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            )}
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
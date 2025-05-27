// Vercel Firewall API utilities
// Based on: https://vercel.com/docs/rest-api/reference/endpoints/security/update-firewall-configuration

interface VercelFirewallResponse {
  success: boolean;
  error?: string;
}

interface BlockedIP {
  id: string;
  hostname?: string;
  ip: string;
  notes?: string;
  action: 'deny' | 'allow';
}

interface FirewallCondition {
  type: string;
  op: string;
  neg?: boolean;
  key?: string;
  value: string;
}

interface FirewallRule {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  conditionGroup: {
    conditions: FirewallCondition[];
  }[];
  action: {
    mitigate: {
      action: 'deny' | 'challenge' | 'allow';
      rateLimit?: Record<string, unknown>;
      redirect?: Record<string, unknown>;
      actionDuration?: string;
      bypassSystem?: boolean;
    };
  };
}

interface FirewallConfig {
  ownerId: string;
  projectKey: string;
  id: string;
  version: number;
  updatedAt: string;
  firewallEnabled: boolean;
  crs?: Record<string, unknown>;
  rules: FirewallRule[];
  ips: BlockedIP[];
  changes: Record<string, unknown>[];
  managedRules?: Record<string, unknown>;
}

/**
 * Add an IP address to Vercel Firewall IP blocking list
 */
export async function addIPToVercelFirewall(
  ip: string, 
  reason: string = 'Automated block - validation errors'
): Promise<VercelFirewallResponse> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const teamId = process.env.VERCEL_TEAM_ID; // Optional, for team accounts
    
    if (!vercelToken) {
      console.error('VERCEL_TOKEN not configured');
      return { success: false, error: 'Vercel token not configured' };
    }

    if (!projectId) {
      console.error('VERCEL_PROJECT_ID not configured');
      return { success: false, error: 'Vercel project ID not configured' };
    }

    // First, get current firewall configuration to check for existing IPs
    const getConfigUrl = teamId 
      ? `https://api.vercel.com/v1/security/firewall/config/active?projectId=${projectId}&teamId=${teamId}`
      : `https://api.vercel.com/v1/security/firewall/config/active?projectId=${projectId}`;

    console.log(`🔍 Getting current firewall config for project ${projectId}...`);

    const getConfigResponse = await fetch(getConfigUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!getConfigResponse.ok) {
      const errorData = await getConfigResponse.json().catch(() => ({}));
      console.error('Failed to get current firewall config:', JSON.stringify(errorData));
      return { success: false, error: `Failed to get current firewall config: ${JSON.stringify(errorData)}` };
    }

    const currentConfig: FirewallConfig = await getConfigResponse.json();
    console.log(`📋 Current config has ${currentConfig.ips?.length || 0} blocked IPs`);
    
    // Check if IP is already blocked
    const existingBlockedIPs = currentConfig.ips || [];
    const isAlreadyBlocked = existingBlockedIPs.some(blockedIP => blockedIP.ip === ip);
    
    if (isAlreadyBlocked) {
      console.log(`IP ${ip} is already blocked`);
      return { success: true, error: 'IP already blocked' };
    }

    // Add IP to firewall using the update endpoint
    const updateUrl = teamId 
      ? `https://api.vercel.com/v1/security/firewall/config?projectId=${projectId}&teamId=${teamId}`
      : `https://api.vercel.com/v1/security/firewall/config?projectId=${projectId}`;

    console.log(`🔒 Adding IP ${ip} to firewall...`);

    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'ip.insert',
        id: null, // null for new IP blocks
        value: {
          ip: ip,
          hostname: '', // Optional hostname
          notes: reason,
          action: 'deny'
        }
      }),
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({}));
      console.error('Failed to add IP to Vercel Firewall:', JSON.stringify(errorData));
      return { success: false, error: `Failed to add IP to firewall: ${JSON.stringify(errorData)}` };
    }

    console.log(`✅ Successfully added IP ${ip} to Vercel Firewall`);
    return { success: true };

  } catch (error) {
    console.error('Error adding IP to Vercel Firewall:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Add an IP address to a specific Vercel Firewall rule (like "block-users")
 * This is an alternative approach using custom rules instead of IP blocking
 */
export async function addIPToVercelFirewallRule(
  ip: string, 
  ruleName: string = 'block-users',
  reason: string = 'Automated block - validation errors'
): Promise<VercelFirewallResponse> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const teamId = process.env.VERCEL_TEAM_ID;
    
    if (!vercelToken || !projectId) {
      console.error('VERCEL_TOKEN or VERCEL_PROJECT_ID not configured');
      return { success: false, error: 'Vercel credentials not configured' };
    }

    // Get current firewall configuration
    const getConfigUrl = teamId 
      ? `https://api.vercel.com/v1/security/firewall/config/active?projectId=${projectId}&teamId=${teamId}`
      : `https://api.vercel.com/v1/security/firewall/config/active?projectId=${projectId}`;

    const getConfigResponse = await fetch(getConfigUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!getConfigResponse.ok) {
      const errorData = await getConfigResponse.json().catch(() => ({}));
      console.error('Failed to get current firewall config:', JSON.stringify(errorData));
      return { success: false, error: 'Failed to get current firewall config' };
    }

    const currentConfig: FirewallConfig = await getConfigResponse.json();
    const rules = currentConfig.rules || [];
    
    // Find the specific rule by name
    const targetRule = rules.find((rule: FirewallRule) => rule.name === ruleName);
    
    if (!targetRule) {
      console.error(`Rule "${ruleName}" not found. Available rules: ${rules.map(r => r.name).join(', ')}`);
      return { success: false, error: `Rule "${ruleName}" not found` };
    }

    // Get current conditions from the rule
    const currentConditions = targetRule.conditionGroup?.[0]?.conditions || [];
    
    // Check if IP is already in the rule
    const isAlreadyBlocked = currentConditions.some((condition: FirewallCondition) => 
      condition.type === 'ip' && condition.value === ip
    );
    
    if (isAlreadyBlocked) {
      console.log(`IP ${ip} is already blocked in rule "${ruleName}"`);
      return { success: true, error: 'IP already blocked in rule' };
    }

    // Add new IP condition
    const newCondition = {
      type: 'ip',
      op: 'eq',
      value: ip
    };

    const updatedConditions = [...currentConditions, newCondition];

    // Update the rule with new conditions
    const updateUrl = teamId 
      ? `https://api.vercel.com/v1/security/firewall/config?projectId=${projectId}&teamId=${teamId}`
      : `https://api.vercel.com/v1/security/firewall/config?projectId=${projectId}`;

    const updateRuleResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'rules.update',
        id: targetRule.id,
        value: {
          name: targetRule.name,
          description: targetRule.description || `${reason} - Updated ${new Date().toISOString()}`,
          active: targetRule.active,
          conditionGroup: [{
            conditions: updatedConditions
          }],
          action: targetRule.action
        }
      }),
    });

    if (!updateRuleResponse.ok) {
      const errorData = await updateRuleResponse.json().catch(() => ({}));
      console.error('Failed to update Vercel Firewall rule:', JSON.stringify(errorData));
      return { success: false, error: 'Failed to update firewall rule' };
    }

    console.log(`✅ Successfully added IP ${ip} to Vercel Firewall rule "${ruleName}"`);
    return { success: true };

  } catch (error) {
    console.error('Error adding IP to Vercel Firewall rule:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}



/**
 * Remove an IP address from Vercel Firewall blocklist
 */
export async function removeIPFromVercelFirewall(ip: string): Promise<VercelFirewallResponse> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;
    
    if (!vercelToken) {
      console.error('VERCEL_TOKEN not configured');
      return { success: false, error: 'Vercel token not configured' };
    }

    const baseUrl = 'https://api.vercel.com/v1/security/firewall/config';
    const url = teamId ? `${baseUrl}?teamId=${teamId}` : baseUrl;

    // Get current config
    const getCurrentConfig = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!getCurrentConfig.ok) {
      return { success: false, error: 'Failed to get current firewall config' };
    }

    const currentConfig = await getCurrentConfig.json();
    const existingBlockedIPs: BlockedIP[] = currentConfig.ipBlocking?.blockedIPs || [];
    
    // Remove the IP from the list
    const updatedBlockedIPs = existingBlockedIPs.filter(blockedIP => blockedIP.ip !== ip);

    // Update firewall configuration
    const updateResponse = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ipBlocking: {
          ...currentConfig.ipBlocking,
          blockedIPs: updatedBlockedIPs
        }
      }),
    });

    if (!updateResponse.ok) {
      return { success: false, error: 'Failed to update firewall config' };
    }

    console.log(`✅ Successfully removed IP ${ip} from Vercel Firewall blocklist`);
    return { success: true };

  } catch (error) {
    console.error('Error removing IP from Vercel Firewall:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get list of currently blocked IPs from Vercel Firewall
 */
export async function getBlockedIPs(): Promise<{ success: boolean; blockedIPs?: BlockedIP[]; error?: string }> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;
    
    if (!vercelToken) {
      return { success: false, error: 'Vercel token not configured' };
    }

    const baseUrl = 'https://api.vercel.com/v1/security/firewall/config';
    const url = teamId ? `${baseUrl}?teamId=${teamId}` : baseUrl;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, error: 'Failed to get firewall config' };
    }

    const config = await response.json();
    const blockedIPs: BlockedIP[] = config.ipBlocking?.blockedIPs || [];

    return { success: true, blockedIPs };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
} 
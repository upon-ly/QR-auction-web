// Vercel Firewall API utilities
// Based on: https://vercel.com/docs/vercel-firewall/firewall-api

interface VercelFirewallResponse {
  success: boolean;
  error?: string;
}

interface BlockedIP {
  ip: string;
  reason?: string;
  notes?: string;
}

interface FirewallCondition {
  type: string;
  op: string;
  value: string;
}

interface FirewallRule {
  id: string;
  name: string;
  description?: string;
  action: string;
  conditionGroups?: {
    conditions: FirewallCondition[];
  }[];
}

/**
 * Add an IP address to a specific Vercel Firewall rule (like "block-users")
 */
export async function addIPToVercelFirewallRule(
  ip: string, 
  ruleName: string = 'block-users',
  reason: string = 'Automated block - validation errors'
): Promise<VercelFirewallResponse> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID; // Optional, for team accounts
    
    if (!vercelToken) {
      console.error('VERCEL_TOKEN not configured');
      return { success: false, error: 'Vercel token not configured' };
    }

    // Construct the API URL for rules
    const baseUrl = 'https://api.vercel.com/v1/security/firewall/rules';
    const url = teamId ? `${baseUrl}?teamId=${teamId}` : baseUrl;

    // First, get current rules to find the "block-users" rule
    const getRulesResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!getRulesResponse.ok) {
      const errorText = await getRulesResponse.text();
      console.error('Failed to get current firewall rules:', errorText);
      return { success: false, error: 'Failed to get current firewall rules' };
    }

    const rulesData = await getRulesResponse.json();
    const rules = rulesData.rules || [];
    
    // Find the specific rule by name
    const targetRule = rules.find((rule: FirewallRule) => rule.name === ruleName);
    
    if (!targetRule) {
      console.error(`Rule "${ruleName}" not found`);
      return { success: false, error: `Rule "${ruleName}" not found` };
    }

    // Get current conditions from the rule
    const currentConditions = targetRule.conditionGroups?.[0]?.conditions || [];
    
    // Check if IP is already in the rule
    const ipConditions = currentConditions.filter((condition: FirewallCondition) => 
      condition.type === 'ip_address' && condition.op === 'eq'
    );
    
    const isAlreadyBlocked = ipConditions.some((condition: FirewallCondition) => 
      condition.value === ip
    );
    
    if (isAlreadyBlocked) {
      console.log(`IP ${ip} is already blocked in rule "${ruleName}"`);
      return { success: true, error: 'IP already blocked' };
    }

    // Add new IP condition
    const newCondition = {
      type: 'ip_address',
      op: 'eq',
      value: ip
    };

    const updatedConditions = [...currentConditions, newCondition];

    // Update the rule with new conditions
    const updateRuleResponse = await fetch(`${url}/${targetRule.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: targetRule.name,
        description: targetRule.description || `${reason} - Updated ${new Date().toISOString()}`,
        conditionGroups: [{
          conditions: updatedConditions
        }],
        action: targetRule.action
      }),
    });

    if (!updateRuleResponse.ok) {
      const errorText = await updateRuleResponse.text();
      console.error('Failed to update Vercel Firewall rule:', errorText);
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
 * Add an IP address to Vercel Firewall blocklist (legacy method for general IP blocking)
 */
export async function addIPToVercelFirewall(
  ip: string, 
  reason: string = 'Automated block - validation errors'
): Promise<VercelFirewallResponse> {
  // Use the rule-based approach with default rule name
  return addIPToVercelFirewallRule(ip, 'block-users', reason);
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
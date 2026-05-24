import { AgentMonitorSystemStatus } from '../types';
import { apiClient } from './apiClient';

export const systemApi = {
  getSystemStatus: async (): Promise<AgentMonitorSystemStatus> => {
    const response = await apiClient.get<AgentMonitorSystemStatus>('/system/status');
    return response.data;
  },
};

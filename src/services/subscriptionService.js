import { api } from './api';

export const subscriptionService = {
  getSubscriptions: async () => {
    return api.get('/subscriptions');
  },
  addSubscription: async (subscriptionData) => {
    return api.post('/subscriptions', subscriptionData);
  },
  deleteSubscription: async (id) => {
    return api.delete(`/subscriptions/${id}`);
  },
};

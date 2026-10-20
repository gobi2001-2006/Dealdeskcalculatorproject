import axios from 'axios'

/**
 * Deal Desk API Client (FastAPI Backend Interface)
 * 
 * Reserved client for backend API communication.
 * In upcoming milestones, this client will connect to backend services:
 * - Master Data & SKUs (Milestone 2)
 * - Pricing Engine & Calculations (Milestone 3)
 * - Proposals Persistence (Milestone 4)
 * 
 * Note: No fake financial calculations or fabricated endpoints are implemented here.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

export default apiClient

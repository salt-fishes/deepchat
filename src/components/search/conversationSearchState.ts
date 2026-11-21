import { create } from 'zustand'

/** 全屏会话搜索页；独立来源面板的搜索状态，避免互相干扰。 */
type ConversationSearchState = {
  open: boolean
  query: string
}

export const useConversationSearch = create<ConversationSearchState>(() => ({
  open: false,
  query: '',
}))

export const openConversationSearch = () =>
  useConversationSearch.setState({ open: true, query: '' })

export const closeConversationSearch = () =>
  useConversationSearch.setState({ open: false, query: '' })

export const setConversationSearchQuery = (query: string) =>
  useConversationSearch.setState({ query })

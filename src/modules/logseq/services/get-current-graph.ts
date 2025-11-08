import { useQuery } from "react-query"

const useGetCurrentGraph = () => {
  return useQuery({
    queryFn: async () => {
      const graph = await window.logseq.App.getCurrentGraph()
      if (!graph) {
        throw new Error('No graph found')
      }
      return graph
    },
    queryKey: ['get-current-graph'],
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 1000,
    staleTime: 5000,
  })
}

export default useGetCurrentGraph
import { useQuery } from "react-query"

const useGetCurrentPage = () => {
  return useQuery({
    queryFn: async () => {
      const page = await window.logseq.Editor.getCurrentPage()
      // Return null if no page (home screen) - this is VALID, not an error
      return page || null
    },
    queryKey: ['get-current-page'],
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 1000,
    staleTime: 5000,
  })
}

export default useGetCurrentPage
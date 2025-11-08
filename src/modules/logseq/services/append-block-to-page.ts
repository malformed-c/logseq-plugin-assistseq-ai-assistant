import { useMutation } from "react-query"

const useAppendBlockToPage = () => {

  return useMutation({
    mutationFn: async ({text}: {text: string}) => {
      const currentPage = await logseq.Editor.getCurrentPage()

      if (currentPage?.name) {
        await logseq.Editor.appendBlockInPage(currentPage.name as string, text)
      }
    },
    mutationKey: ['append-block-to-page']
  })
}

export default useAppendBlockToPage
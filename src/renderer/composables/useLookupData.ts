import { useQuery } from "@tanstack/vue-query";
import { ipcRenderer } from "../api";

export function useLookupData() {
  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: () => ipcRenderer.invoke("get-tags"),
    initialData: [],
  });

  const { data: artists } = useQuery({
    queryKey: ["artists"],
    queryFn: () => ipcRenderer.invoke("get-artists"),
    initialData: [],
  });

  const { data: series } = useQuery({
    queryKey: ["series"],
    queryFn: () => ipcRenderer.invoke("get-series"),
    initialData: [],
  });

  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: () => ipcRenderer.invoke("get-groups"),
    initialData: [],
  });

  const { data: characters } = useQuery({
    queryKey: ["characters"],
    queryFn: () => ipcRenderer.invoke("get-characters"),
    initialData: [],
  });

  const { data: types } = useQuery({
    queryKey: ["types"],
    queryFn: () => ipcRenderer.invoke("get-types"),
    initialData: [],
  });

  const { data: languages } = useQuery({
    queryKey: ["languages"],
    queryFn: () => ipcRenderer.invoke("get-languages"),
    initialData: [],
  });

  return {
    tags,
    artists,
    series,
    groups,
    characters,
    types,
    languages,
  };
}

import type { Dispatch, SetStateAction } from "react";

import { CustomParamsField } from "./chat-params/CustomParamsField";
import { SamplingFields } from "./chat-params/SamplingFields";
import { ToggleFields } from "./chat-params/ToggleFields";
import type { ModelFormState } from "../types";

export function ChatParamsSection({
  modelForm,
  setModelForm,
}: {
  modelForm: ModelFormState;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
}) {
  return (
    <div>
      <SamplingFields modelForm={modelForm} setModelForm={setModelForm} />
      <ToggleFields modelForm={modelForm} setModelForm={setModelForm} />
      <CustomParamsField modelForm={modelForm} setModelForm={setModelForm} />
    </div>
  );
}

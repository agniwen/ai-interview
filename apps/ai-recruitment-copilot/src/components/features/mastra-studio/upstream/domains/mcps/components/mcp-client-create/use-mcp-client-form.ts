import { useForm } from "react-hook-form";

export interface MCPClientFormValues {
  name: string;
  description: string;
  serverName: string;
  serverType: "stdio" | "http";
  url: string;
  timeout: number;
  command: string;
  args: string;
  env: { key: string; value: string }[];
}

export const useMCPClientForm = (defaultValues?: Partial<MCPClientFormValues>) => {
  const form = useForm<MCPClientFormValues>({
    defaultValues: {
      args: "",
      command: "",
      description: "",
      env: [],
      name: "",
      serverName: "default",
      serverType: "http",
      timeout: 30_000,
      url: "",
      ...defaultValues,
    },
    resolver: (values) => {
      const errors: Record<string, { type: string; message: string }> = {};

      if (!values.name.trim()) {
        errors.name = { message: "请输入名称", type: "required" };
      }

      if (!values.serverName.trim()) {
        errors.serverName = { message: "请输入服务器名称", type: "required" };
      }

      if (values.serverType === "http" && !values.url.trim()) {
        errors.url = { message: "HTTP 服务器必须填写 URL", type: "required" };
      }

      if (values.serverType === "stdio" && !values.command.trim()) {
        errors.command = { message: "stdio 服务器必须填写命令", type: "required" };
      }

      return {
        errors,
        values: Object.keys(errors).length === 0 ? values : {},
      };
    },
  });

  return { form };
};

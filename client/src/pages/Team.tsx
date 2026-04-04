import { useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useTeam, useInviteTeamMember, useUpdateTeamMember, useDeleteTeamMember, type TeamMember } from "@/lib/api";
import { UserPlus, Pencil, Trash2, Crown, User } from "lucide-react";

export default function Team() {
  const { data: auth } = useAuth();
  const { data: team = [], isLoading } = useTeam();
  const inviteMutation = useInviteTeamMember();
  const updateMutation = useUpdateTeamMember();
  const deleteMutation = useDeleteTeamMember();
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Form: convidar
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "manager">("manager");

  // Form: editar
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<"owner" | "manager">("manager");

  const isOwner = auth?.user?.role === "owner";
  const currentUserId = auth?.user?.id;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await inviteMutation.mutateAsync({
        name: inviteName,
        email: inviteEmail,
        password: invitePassword,
        phone: invitePhone || undefined,
        role: inviteRole,
      });
      toast({ title: "Usuário convidado com sucesso!" });
      setInviteOpen(false);
      setInviteName(""); setInviteEmail(""); setInvitePhone(""); setInvitePassword(""); setInviteRole("manager");
    } catch (error: any) {
      toast({ title: "Erro ao convidar", description: error.message, variant: "destructive" });
    }
  };

  const openEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditPhone(member.phone || "");
    setEditRole(member.role);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      await updateMutation.mutateAsync({ id: editingMember.id, name: editName, phone: editPhone || undefined, role: editRole });
      toast({ title: "Usuário atualizado!" });
      setEditOpen(false);
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Usuário removido" });
    } catch (error: any) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Equipe</h1>
          <p className="text-muted-foreground mt-1">Gerencie os usuários com acesso ao sistema</p>
        </div>
        {isOwner && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="w-4 h-4" />
                Convidar Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convidar Novo Usuário</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={inviteName} onChange={e => setInviteName(e.target.value)} required placeholder="João Silva" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required placeholder="joao@email.com" />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp (opcional)</Label>
                  <Input value={invitePhone} onChange={e => setInvitePhone(e.target.value)} placeholder="5511999990000" />
                </div>
                <div className="space-y-2">
                  <Label>Senha inicial</Label>
                  <Input type="password" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
                </div>
                <div className="space-y-2">
                  <Label>Papel</Label>
                  <Select value={inviteRole} onValueChange={v => setInviteRole(v as "owner" | "manager")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Gerente — acesso completo ao sistema</SelectItem>
                      <SelectItem value="owner">Dono — acesso completo + gestão de equipe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? "Convidando..." : "Convidar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isOwner && (
        <div className="mb-6 p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-lg text-sm text-yellow-400">
          Apenas o dono da conta pode convidar ou remover usuários.
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Carregando equipe...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {team.map((member) => (
            <Card key={member.id} className="border-border bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      {member.role === "owner" ? (
                        <Crown className="w-5 h-5 text-primary" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {member.name}
                        {member.id === currentUserId && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">(você)</span>
                        )}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                    {member.role === "owner" ? "Dono" : "Gerente"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {member.phone && (
                  <p className="text-xs text-muted-foreground mb-3">WhatsApp: {member.phone}</p>
                )}
                {isOwner && member.id !== currentUserId && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openEdit(member)}>
                      <Pencil className="w-3 h-3" /> Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover {member.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O usuário perderá acesso ao sistema.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(member.id)} className="bg-destructive hover:bg-destructive/90">
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog editar membro */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {editingMember?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="5511999990000" />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v as "owner" | "manager")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="owner">Dono</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
